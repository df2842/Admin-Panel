import type { Supabase } from "@/lib/admin";
import type { JokeStyle } from "@/lib/joke-styles";
import { isMissingSchema } from "@/lib/setup";

/** One model call, as recorded in llm_responses. */
export type LlmCall = {
  stepOrder: number;
  stepName: string;
  modelId: number | null;
  apiModelId: string;
  attempt: number;
  status: "ok" | "error" | "empty";
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  prompt: string;
  responseText: string | null;
  error: string | null;
};

/** Kept under the SQL limits (prompt/response 8000, errors 2000 or 1000, names 100). */
const TEXT_LIMIT = 4000;
const ERROR_LIMIT = 1000;
const NAME_LIMIT = 100;

/** Shortens `s` to at most `max` characters, "…" included, without splitting an emoji. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut}…`;
}
const clipOrNull = (s: string | null, max: number) => (s == null ? null : clip(s, max));

/**
 * Records a generation request and every LLM call it makes, so the Admin
 * Panel can show what the pipeline did. Logging is best-effort: if the
 * tables don't exist yet or a write fails, the action still succeeds.
 * A copy of Caption Arena's src/lib/generation-log.ts (keep them in sync),
 * except that `style` may be null: a re-describe writes no jokes.
 */
export class GenerationLog {
  private pending: PromiseLike<unknown>[] = [];

  private constructor(
    private readonly supabase: Supabase,
    /** null when logging is unavailable (tables missing or insert failed). */
    readonly requestId: string | null,
  ) {}

  static async start(
    supabase: Supabase,
    input: {
      userId: string;
      /** "describe" is an admin re-describing a photo. */
      kind: "upload" | "more_jokes" | "describe";
      /** null for "describe", which writes no jokes. */
      style: JokeStyle | null;
      chainId: number | null;
      imageId?: string;
    },
  ): Promise<GenerationLog> {
    const { data, error } = await supabase
      .from("generation_requests")
      .insert({
        user_id: input.userId,
        kind: input.kind,
        style: input.style,
        chain_id: input.chainId,
        image_id: input.imageId ?? null,
      })
      .select("id")
      .single();
    if (error) {
      if (!isMissingSchema(error)) console.error("[generation-log] start", error.message);
      return new GenerationLog(supabase, null);
    }
    return new GenerationLog(supabase, data.id as string);
  }

  /** Queues one llm_responses row (non-blocking). */
  call(entry: LlmCall) {
    if (!this.requestId) return;
    const write = this.supabase
      .from("llm_responses")
      .insert({
        request_id: this.requestId,
        step_order: entry.stepOrder,
        step_name: clip(entry.stepName, NAME_LIMIT),
        model_id: entry.modelId,
        api_model_id: clip(entry.apiModelId, NAME_LIMIT),
        attempt: entry.attempt,
        status: entry.status,
        latency_ms: entry.latencyMs,
        input_tokens: entry.inputTokens,
        output_tokens: entry.outputTokens,
        prompt: clip(entry.prompt, TEXT_LIMIT),
        response_text: clipOrNull(entry.responseText, TEXT_LIMIT),
        error: clipOrNull(entry.error, ERROR_LIMIT),
      })
      .then(({ error }) => {
        if (error) console.error("[generation-log] llm_responses", error.message);
      });
    this.pending.push(write);
  }

  /** Marks the request finished and waits for queued writes. */
  async finish(result: { status: "succeeded" | "failed"; imageId?: string | null; captionCount?: number; error?: string }) {
    await Promise.allSettled(this.pending);
    if (!this.requestId) return;
    const { error } = await this.supabase
      .from("generation_requests")
      .update({
        status: result.status,
        image_id: result.imageId ?? undefined,
        caption_count: result.captionCount ?? 0,
        error: result.error ? clip(result.error, ERROR_LIMIT) : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", this.requestId);
    if (error) console.error("[generation-log] finish", error.message);
  }
}
