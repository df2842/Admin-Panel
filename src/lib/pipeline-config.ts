import type { Supabase } from "@/lib/admin";

/**
 * Everything the AI pipeline needs, read from the database (this panel
 * manages it): which models to try and in what order, the prompt chain's
 * steps, how a "Mixed bag" batch splits across humor flavors, comedy terms,
 * and few-shot examples. Every piece falls back to the built-in defaults
 * below, so the app keeps working before the Week 7 migration is run or if a
 * table is empty.
 *
 * A copy of Caption Arena's src/lib/pipeline-config.ts, so the panel's own AI
 * tools (AI upload, Generate more, Re-describe) run the same pipeline. Keep
 * the two in sync.
 */
export type PipelineModel = {
  id: number | null;
  apiModelId: string;
  /** Can read images; only these describe the photo (step 1). */
  supportsVision: boolean;
};
export type PipelineStep = {
  order: number;
  name: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
};
export type MixFlavor = { flavor: string; label: string; instruction: string; weight: number };
export type PipelineTerm = { term: string; definition: string; example: string | null };
/** `flavor` is the mix flavor's label when it matches one, else the text as typed. */
export type PipelineExample = { description: string; caption: string; flavor: string | null };

export type PipelineConfig = {
  chainId: number | null;
  models: PipelineModel[];
  describe: PipelineStep;
  joke: PipelineStep;
  mix: MixFlavor[];
  terms: PipelineTerm[];
  examples: PipelineExample[];
  /** "database" when the chain came from the DB, "defaults" otherwise. */
  source: "database" | "defaults";
};

export const CHAIN_SLUG = "describe-then-joke";

const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];

/** Built-in or env-listed models: all Gemini Flash-Lite, which read images. */
const builtInModels = (ids: string[]): PipelineModel[] =>
  ids.map((apiModelId) => ({ id: null, apiModelId, supportsVision: true }));

export const DEFAULT_CONFIG: PipelineConfig = {
  chainId: null,
  models: builtInModels(DEFAULT_MODELS),
  describe: {
    order: 1,
    name: "Describe the photo",
    systemPrompt:
      "You describe photos for a comedy writer who cannot see them. Be concrete and vivid: who or what is in " +
      "the frame, expressions, body language, setting, any text in the image, and anything odd, awkward or " +
      "surprising. Two to four sentences of plain prose, no lists. Describe people neutrally and never guess " +
      "their identity.",
    userPrompt: "Describe this image.",
    temperature: 0.5,
  },
  joke: {
    order: 2,
    name: "Write the jokes",
    systemPrompt:
      "You write captions that get printed under a photo. Write exactly {{count}} jokes about the photo " +
      "described. Every joke must hinge on a specific detail of THIS photo, something you could only write " +
      "after seeing it, not a generic one-liner. {{style}} Each caption is one punchy line under 90 characters. " +
      "No hashtags, no emojis, no surrounding quotation marks, no explanations. Keep it PG-13 and never mock " +
      "anyone's body, race, gender or identity.",
    userPrompt: "Photo description:\n{{description}}",
    temperature: 1.0,
  },
  mix: [
    { flavor: "deadpan", label: "Deadpan", instruction: "a dry, deadpan observation", weight: 25 },
    { flavor: "wordplay", label: "Wordplay", instruction: "a pun or wordplay", weight: 25 },
    { flavor: "absurd", label: "Absurd escalation", instruction: "an absurd escalation delivered with a straight face", weight: 25 },
    { flavor: "relatable", label: "Painfully relatable", instruction: "a painfully relatable line", weight: 25 },
  ],
  terms: [],
  examples: [],
  source: "defaults",
};

/** The joke step gets the first MAX_TERMS active terms (A to Z) and the MAX_EXAMPLES newest examples. */
export const MAX_TERMS = 12;
export const MAX_EXAMPLES = 4;

/** Loads the live pipeline config; never throws. */
export async function loadPipelineConfig(supabase: Supabase): Promise<PipelineConfig> {
  // An explicit override is handy for testing fallbacks locally.
  const envModels = process.env.GEMINI_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);

  try {
    const [models, chain, terms] = await Promise.all([
      supabase
        .from("llm_models")
        .select("id, api_model_id, supports_vision, priority, is_active, llm_providers!inner(is_active, slug)")
        .eq("is_active", true)
        .eq("llm_providers.is_active", true)
        .eq("llm_providers.slug", "google")
        .order("priority")
        .order("id"),
      supabase
        .from("prompt_chains")
        .select(
          "id, is_active, prompt_chain_steps(step_order, name, input_type, system_prompt, user_prompt, temperature), " +
            "prompt_chain_mix(flavor, label, instruction, weight, sort_order)",
        )
        .eq("slug", CHAIN_SLUG)
        .maybeSingle(),
      supabase
        .from("terms")
        .select("term, definition, example")
        .eq("is_active", true)
        .order("term")
        .limit(MAX_TERMS),
    ]);

    const config: PipelineConfig = { ...DEFAULT_CONFIG };

    // Models: only Gemini (Google) models can run here, in priority order.
    type ModelRow = { id: number; api_model_id: string; supports_vision: boolean | null };
    const modelRows = (models.data as ModelRow[] | null) ?? [];
    if (!models.error && modelRows.length > 0) {
      config.models = modelRows.map((m) => ({
        id: m.id,
        apiModelId: m.api_model_id,
        supportsVision: m.supports_vision !== false,
      }));
    }

    type StepRow = {
      step_order: number;
      name: string;
      input_type: string;
      system_prompt: string;
      user_prompt: string;
      temperature: number;
    };
    type ChainRow = {
      id: number;
      is_active: boolean;
      prompt_chain_steps: StepRow[];
      prompt_chain_mix: { flavor: string; label: string; instruction: string; weight: number; sort_order: number }[];
    };
    const row = chain.data as ChainRow | null;
    if (!chain.error && row?.is_active) {
      // A step with a blank prompt can't run, so the built-in step stands in for it.
      const steps = row.prompt_chain_steps
        .filter((s) => s.system_prompt?.trim() && s.user_prompt?.trim())
        .sort((a, b) => a.step_order - b.step_order);
      // Step 1 reads the photo, step 2 the description: pick by input type, then by position.
      const describeRow = steps.find((s) => s.input_type === "image") ?? (steps.length > 1 ? steps[0] : undefined);
      const jokeRow =
        steps.find((s) => s !== describeRow && s.input_type === "text") ?? steps.find((s) => s !== describeRow);
      const toStep = (s: StepRow): PipelineStep => ({
        order: s.step_order,
        name: s.name,
        systemPrompt: s.system_prompt,
        userPrompt: s.user_prompt,
        temperature: Number(s.temperature),
      });
      config.chainId = row.id;
      if (describeRow) config.describe = toStep(describeRow);
      if (jokeRow) config.joke = toStep(jokeRow);
      config.source = "database";

      const mix = [...row.prompt_chain_mix]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ flavor, label, instruction, weight }) => ({ flavor, label, instruction, weight }));
      if (mix.some((m) => m.weight > 0)) config.mix = mix;
    }

    // Examples: the newest active ones that are unassigned or for this chain.
    const examples = await supabase
      .from("ai_generation_examples")
      .select("image_description, caption, flavor")
      .eq("is_active", true)
      .or(config.chainId === null ? "chain_id.is.null" : `chain_id.is.null,chain_id.eq.${config.chainId}`)
      .order("created_at", { ascending: false })
      .limit(MAX_EXAMPLES);
    type ExampleRow = { image_description: string; caption: string; flavor: string | null };
    if (!examples.error && examples.data) {
      const labels = new Map(config.mix.map((m) => [m.flavor, m.label]));
      config.examples = (examples.data as ExampleRow[]).map((e) => ({
        description: e.image_description,
        caption: e.caption,
        flavor: e.flavor?.trim() ? (labels.get(e.flavor.trim()) ?? e.flavor.trim()) : null,
      }));
    }

    if (!terms.error && terms.data) config.terms = terms.data as PipelineTerm[];

    if (envModels?.length) config.models = builtInModels(envModels);
    return config;
  } catch (err) {
    console.error("[pipeline-config] falling back to defaults", err);
    return envModels?.length ? { ...DEFAULT_CONFIG, models: builtInModels(envModels) } : DEFAULT_CONFIG;
  }
}

/**
 * Splits `count` jokes across flavors in proportion to their weights
 * (largest-remainder rounding), e.g. weights 25/25/25/25 and 4 jokes -> 1 each.
 * Integer math, and ties go to the flavor listed first, matching the preview
 * in the Admin Panel's mix editor.
 */
export function splitMix(mix: MixFlavor[], count: number): { flavor: MixFlavor; n: number }[] {
  const active = mix.filter((m) => m.weight > 0);
  const total = active.reduce((s, m) => s + m.weight, 0);
  if (total === 0 || count <= 0) return [];
  const base = active.map((flavor, index) => {
    const scaled = flavor.weight * count;
    const n = Math.floor(scaled / total);
    return { flavor, index, n, rem: scaled - n * total };
  });
  let left = count - base.reduce((s, b) => s + b.n, 0);
  [...base]
    .sort((a, b) => b.rem - a.rem || a.index - b.index)
    .forEach((b) => {
      if (left > 0 && b.rem > 0) {
        b.n += 1;
        left -= 1;
      }
    });
  return base.filter((b) => b.n > 0).map(({ flavor, n }) => ({ flavor, n }));
}

/** Replaces {{name}} placeholders; unknown ones become empty. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => values[key] ?? "").trim();
}

/** Whether `template` has a {{name}} placeholder, matched the way fill() matches it. */
export function hasPlaceholder(template: string, name: string): boolean {
  return new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`).test(template);
}
