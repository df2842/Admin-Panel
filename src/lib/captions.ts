import { GoogleGenAI, ThinkingLevel, Type, type GenerateContentParameters } from "@google/genai";
import type { LlmCall } from "@/lib/generation-log";
import { JOKE_STYLES, parseStyle, type JokeStyle } from "@/lib/joke-styles";
import {
  DEFAULT_CONFIG,
  fill,
  hasPlaceholder,
  splitMix,
  type PipelineConfig,
  type PipelineStep,
} from "@/lib/pipeline-config";

export { JOKE_STYLES, parseStyle, type JokeStyle };

/** Each attempt gets at most this long before we move on to the next model. */
const ATTEMPT_TIMEOUT_MS = 12_000;
/** Don't start an attempt with less time than this left before the deadline. */
const MIN_ATTEMPT_MS = 2_000;
/** Default total budget for one generate() call when the caller sets none. */
const DEFAULT_BUDGET_MS = 30_000;

/** Image types Gemini accepts as input. (GIFs are converted to JPEG in the browser.) */
export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Thrown when every model in the chain failed. The message is safe to show
 * users and reflects the most likely cause.
 */
export class ModelsBusyError extends Error {
  constructor(
    message: string,
    public readonly causes: string[],
  ) {
    super(message);
    this.name = "ModelsBusyError";
  }
}

let client: GoogleGenAI | null = null;
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("The AI isn't configured on the server (GEMINI_API_KEY is missing).");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Statuses where trying another model (or later) can help. */
const TRANSIENT = new Set([404, 408, 429, 500, 502, 503, 504]);

/** Why one attempt failed: an HTTP status, output the step couldn't use, or unknown. */
type Failure = number | "unusable" | undefined;

function userMessage(statuses: Failure[]): string {
  if (statuses.some((s) => s === 401 || s === 403)) {
    return "The AI service rejected the server's API key. The site owner needs to check it.";
  }
  if (statuses.length > 0 && statuses.every((s) => s === 400)) {
    return "The AI couldn't process this image. Try a different JPEG, PNG or WebP photo.";
  }
  if (statuses.some((s) => s === 429)) {
    return "The AI hit its free usage limit for the moment. Please try again in a minute.";
  }
  if (statuses.some((s) => s === "unusable")) {
    return "The AI didn't write usable jokes this time. Please try again.";
  }
  return "The AI models are busy right now. Please try again in a minute.";
}

/** Options shared by both prompt-chain steps. */
export type RunOptions = {
  config?: PipelineConfig;
  /** Epoch ms by which the whole step must finish. */
  deadline?: number;
  /** Receives every model attempt (for the llm_responses log). */
  onCall?: (call: LlmCall) => void;
};

type ModelRequest = Omit<GenerateContentParameters, "model">;
/** Turns a model's text into what the step needs, or says briefly why it can't. */
type Validator<T> = (text: string) => { value: T } | { unusable: string };

/**
 * Runs one generateContent request against each configured model in priority
 * order until one succeeds. Every attempt is bounded by ATTEMPT_TIMEOUT_MS and
 * the overall deadline, and reported through onCall. With `validate`, an
 * answer only counts once it passes; unusable output is logged as an error
 * and the next model is tried.
 */
async function generate(
  request: ModelRequest,
  step: PipelineStep,
  promptText: string,
  options: RunOptions,
): Promise<{ value: string; model: string }>;
async function generate<T>(
  request: ModelRequest,
  step: PipelineStep,
  promptText: string,
  options: RunOptions,
  validate: Validator<T>,
): Promise<{ value: T; model: string }>;
async function generate<T>(
  request: ModelRequest,
  step: PipelineStep,
  promptText: string,
  { config = DEFAULT_CONFIG, deadline = Date.now() + DEFAULT_BUDGET_MS, onCall }: RunOptions,
  validate?: Validator<T>,
): Promise<{ value: T | string; model: string }> {
  const ai = getClient(); // a missing key is a config error, not a busy model
  const causes: string[] = [];
  const statuses: Failure[] = [];
  let attempt = 0;

  for (const model of config.models) {
    attempt += 1;
    const started = Date.now();
    const report = (status: LlmCall["status"], extra: Partial<LlmCall>) =>
      onCall?.({
        stepOrder: step.order,
        stepName: step.name,
        modelId: model.id,
        apiModelId: model.apiModelId,
        attempt,
        status,
        latencyMs: Date.now() - started,
        inputTokens: null,
        outputTokens: null,
        prompt: promptText,
        responseText: null,
        error: null,
        ...extra,
      });

    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      report("error", { error: "Skipped: out of time" });
      causes.push(`${model.apiModelId}: skipped, out of time`);
      statuses.push(504);
      continue;
    }

    try {
      const response = await ai.models.generateContent({
        ...request,
        model: model.apiModelId,
        config: {
          ...request.config,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          abortSignal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
        },
      });
      const text = response.text?.trim();
      const usage = {
        inputTokens: response.usageMetadata?.promptTokenCount ?? null,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
      };
      if (text) {
        const checked = validate ? validate(text) : { value: text };
        if ("value" in checked) {
          report("ok", { ...usage, responseText: text });
          return { value: checked.value, model: model.apiModelId };
        }
        // e.g. cut-off JSON or no caption that passes the filters; another model may do better.
        report("error", { ...usage, responseText: text, error: `Unusable output: ${checked.unusable}` });
        causes.push(`${model.apiModelId}: unusable output (${checked.unusable})`);
        statuses.push("unusable");
        continue;
      }
      // Usually a safety block; another model may answer.
      const reason = response.candidates?.[0]?.finishReason ?? "no candidates";
      report("empty", { ...usage, error: `Empty response (${reason})` });
      causes.push(`${model.apiModelId}: empty response (${reason})`);
      statuses.push(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Gemini reports a bad or expired key as a 400; treat it as an auth error.
      const keyProblem = /API_KEY_INVALID|API key not valid|API key expired/i.test(message);
      const status = keyProblem ? 401 : (err as { status?: number }).status;
      report("error", { error: `${status ?? ""} ${message}`.trim() });
      causes.push(`${model.apiModelId}: ${status ?? ""} ${message.slice(0, 160)}`.trim());
      statuses.push(status);
      // A bad key won't work on any model; stop early. 400s are tried on the
      // next model because some are model-specific (unsupported settings).
      if (status === 401 || status === 403) break;
      if (status !== undefined && status !== 400 && !TRANSIENT.has(status)) break;
    }
  }
  console.error("[captions] every model failed", causes);
  throw new ModelsBusyError(userMessage(statuses), causes);
}

/**
 * Prompt-chain step 1: look at the picture and describe it for a comedy writer.
 */
export async function describeImage(
  base64: string,
  mediaType: ImageMediaType,
  options: RunOptions = {},
): Promise<{ description: string; model: string }> {
  const config = options.config ?? DEFAULT_CONFIG;
  const step = config.describe;
  // Only models that read images get the photo; the built-in ones if none do.
  const vision = config.models.filter((m) => m.supportsVision);
  const models = vision.length > 0 ? vision : DEFAULT_CONFIG.models;
  const systemPrompt = fill(step.systemPrompt, {});
  const userPrompt = fill(step.userPrompt, {});
  const { value, model } = await generate(
    {
      contents: [{ inlineData: { mimeType: mediaType, data: base64 } }, { text: userPrompt }],
      config: { systemInstruction: systemPrompt, temperature: step.temperature },
    },
    step,
    `${systemPrompt}\n\n---\n\n[image: ${mediaType}]\n${userPrompt}`,
    { ...options, config: { ...config, models } },
  );
  return { description: value, model };
}

const MAX_CAPTION_LENGTH = 110;

/** The style sentence for the joke step: a fixed style, or the database mix. */
function styleInstruction(style: JokeStyle, count: number, config: PipelineConfig): string {
  if (style !== "mixed") return JOKE_STYLES[style].prompt;
  const parts = splitMix(config.mix, count);
  if (parts.length === 0) return JOKE_STYLES.mixed.prompt;
  if (parts.length === 1) return `Every caption is ${parts[0].flavor.instruction}.`;
  const list = parts.map((p) => `${p.n} that ${p.n === 1 ? "is" : "are each"} ${p.flavor.instruction}`);
  return `Mix styles: write ${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}.`;
}

/**
 * Prompt-chain step 2: turn the description into jokes about this exact photo.
 * Uses the configured system prompt, the mix, comedy terms and few-shot
 * examples. A JSON response schema asks for an array of strings, and each
 * answer is checked before it counts. `avoid` lists jokes the picture
 * already has, so "more jokes" stays fresh.
 */
export async function writeCaptions(
  description: string,
  options: RunOptions & { style?: JokeStyle; count?: number; avoid?: string[] } = {},
): Promise<{ captions: string[]; model: string }> {
  const config = options.config ?? DEFAULT_CONFIG;
  const step = config.joke;
  const style = options.style ?? "mixed";
  const count = Math.min(Math.max(options.count ?? 4, 1), 6);
  const avoid = (options.avoid ?? []).slice(0, 30);
  const values = { count: String(count), style: styleInstruction(style, count, config), description };

  // A custom prompt may leave out a placeholder. Add what it skipped, so the
  // model still gets the description, the count and the style.
  const prompts = `${step.systemPrompt}\n${step.userPrompt}`;
  const sections = [fill(step.userPrompt, values)];
  if (!hasPlaceholder(prompts, "description")) sections.unshift(`Photo description:\n${description}`);
  if (config.terms.length) {
    sections.push(
      "Comedy techniques you can use:\n" +
        config.terms.map((t) => `- ${t.term}: ${t.definition}${t.example ? ` (e.g. "${t.example}")` : ""}`).join("\n"),
    );
  }
  if (config.examples.length) {
    sections.push(
      "Examples of the tone we want (different photos, do not reuse them):\n" +
        config.examples
          .map((e) => `- Photo: ${e.description}\n  Caption${e.flavor ? ` (${e.flavor})` : ""}: ${e.caption}`)
          .join("\n"),
    );
  }
  if (avoid.length) {
    sections.push(`This photo already has these captions. Do not repeat or paraphrase them:\n- ${avoid.join("\n- ")}`);
  }
  const userPrompt = sections.filter(Boolean).join("\n\n");
  const systemPrompt = [
    fill(step.systemPrompt, values),
    hasPlaceholder(prompts, "count") ? "" : `Write exactly ${count} captions.`,
    hasPlaceholder(prompts, "style") ? "" : values.style,
  ]
    .filter(Boolean)
    .join(" ");

  // Only an answer with at least one usable caption counts; otherwise the next model tries.
  const parseCaptions: Validator<string[]> = (text) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { unusable: "malformed JSON" };
    }
    const list = (parsed as { captions?: unknown } | null)?.captions;
    const seen = new Set(avoid.map((a) => a.toLowerCase()));
    const captions = (Array.isArray(list) ? list : [])
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim().replace(/^["“]+|["”]+$/g, "").trim())
      .filter((c) => c.length > 0 && c.length <= MAX_CAPTION_LENGTH)
      .filter((c) => {
        const key = c.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, count);
    return captions.length > 0 ? { value: captions } : { unusable: "no usable captions" };
  };

  const { value: captions, model } = await generate(
    {
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: step.temperature,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { captions: { type: Type.ARRAY, items: { type: Type.STRING } } },
          required: ["captions"],
        },
      },
    },
    step,
    `${systemPrompt}\n\n---\n\n${userPrompt}`,
    options,
    parseCaptions,
  );
  return { captions, model };
}
