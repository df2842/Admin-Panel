import { GoogleGenAI, ThinkingLevel, Type, type GenerateContentParameters } from "@google/genai";
import { JOKE_STYLES, parseStyle, type JokeStyle } from "@/lib/joke-styles";

export { JOKE_STYLES, parseStyle, type JokeStyle };

/**
 * Cheap, fast, highly available models, tried in order. Flash-Lite is the
 * cheapest Gemini tier and is on the free tier; if one model is overloaded
 * (503) or rate limited (429), the next one takes over.
 * Override with GEMINI_MODELS="model-a,model-b" (useful for testing).
 */
const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];

export function modelChain(): string[] {
  const fromEnv = process.env.GEMINI_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return fromEnv?.length ? fromEnv : DEFAULT_MODELS;
}

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

function userMessage(statuses: (number | undefined)[]): string {
  if (statuses.some((s) => s === 401 || s === 403)) {
    return "The AI service rejected the server's API key. The site owner needs to check it.";
  }
  if (statuses.length > 0 && statuses.every((s) => s === 400)) {
    return "The AI couldn't process this image. Try a different JPEG, PNG or WebP photo.";
  }
  if (statuses.some((s) => s === 429)) {
    return "The AI hit its free usage limit for the moment. Please try again in a minute.";
  }
  return "The AI models are busy right now. Please try again in a minute.";
}

/**
 * Runs one generateContent request against each model in the chain until one
 * succeeds. Returns the text and which model produced it. Every attempt is
 * bounded by both ATTEMPT_TIMEOUT_MS and the overall `deadline` (epoch ms), so
 * a caller with a hard time limit always gets a clean error in time.
 */
async function generate(
  request: Omit<GenerateContentParameters, "model">,
  deadline = Date.now() + DEFAULT_BUDGET_MS,
): Promise<{ text: string; model: string }> {
  const ai = getClient(); // a missing key is a config error, not a busy model
  const causes: string[] = [];
  const statuses: (number | undefined)[] = [];

  for (const model of modelChain()) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      causes.push(`${model}: skipped, out of time`);
      statuses.push(504);
      break;
    }
    try {
      const response = await ai.models.generateContent({
        ...request,
        model,
        config: {
          ...request.config,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          abortSignal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
        },
      });
      const text = response.text?.trim();
      if (text) return { text, model };
      // Usually a safety block; another model may answer.
      causes.push(`${model}: empty response (${response.candidates?.[0]?.finishReason ?? "no candidates"})`);
      statuses.push(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Gemini reports a bad or expired key as a 400; treat it as an auth error.
      const keyProblem = /API_KEY_INVALID|API key not valid|API key expired/i.test(message);
      const status = keyProblem ? 401 : (err as { status?: number }).status;
      causes.push(`${model}: ${status ?? ""} ${message.slice(0, 160)}`.trim());
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
  deadline?: number,
): Promise<{ description: string; model: string }> {
  const { text, model } = await generate({
    contents: [
      { inlineData: { mimeType: mediaType, data: base64 } },
      { text: "Describe this image." },
    ],
    config: {
      systemInstruction:
        "You describe photos for a comedy writer who cannot see them. Be concrete and vivid: " +
        "who or what is in the frame, expressions, body language, setting, any text in the image, " +
        "and anything odd, awkward or surprising. Two to four sentences of plain prose, no lists. " +
        "Describe people neutrally and never guess their identity.",
      temperature: 0.5,
    },
  }, deadline);
  return { description: text, model };
}

const MAX_CAPTION_LENGTH = 110;

/**
 * Prompt-chain step 2: turn the description into jokes about this exact photo.
 * A JSON response schema guarantees we get an array of strings back.
 * `avoid` lists jokes the picture already has, so "more jokes" stays fresh.
 */
export async function writeCaptions(
  description: string,
  options: { style?: JokeStyle; count?: number; avoid?: string[]; deadline?: number } = {},
): Promise<{ captions: string[]; model: string }> {
  const style = JOKE_STYLES[options.style ?? "mixed"];
  const count = Math.min(Math.max(options.count ?? 4, 1), 6);
  const avoid = (options.avoid ?? []).slice(0, 30);

  const { text, model } = await generate({
    contents:
      `Photo description:\n${description}` +
      (avoid.length
        ? `\n\nThis photo already has these captions. Do not repeat or paraphrase them:\n- ${avoid.join("\n- ")}`
        : ""),
    config: {
      systemInstruction:
        `You write meme captions that get printed on top of a photo. Write exactly ${count} ` +
        "jokes about the photo described. Every joke must hinge on a specific detail of THIS " +
        "photo, something you could only write after seeing it, not a generic one-liner. " +
        `${style.prompt} Each caption is one punchy line under 90 characters. ` +
        "No hashtags, no emojis, no surrounding quotation marks, no explanations. " +
        "Keep it PG-13 and never mock anyone's body, race, gender or identity.",
      temperature: 1.0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          captions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["captions"],
      },
    },
  }, options.deadline);

  let parsed: { captions?: unknown };
  try {
    parsed = JSON.parse(text) as { captions?: unknown };
  } catch {
    throw new Error("The model returned malformed captions. Please try again.");
  }

  const seen = new Set(avoid.map((a) => a.toLowerCase()));
  const captions = (Array.isArray(parsed.captions) ? parsed.captions : [])
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

  if (captions.length === 0) throw new Error("The model returned no usable captions. Please try again.");
  return { captions, model };
}
