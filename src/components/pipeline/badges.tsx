import type { GenerationRequest, LlmResponse, PromptChainStep } from "@/lib/domain";
import { JOKE_STYLES } from "@/lib/joke-styles";

/**
 * Status and label badges for the AI pipeline screens. Every badge pairs its
 * color with an icon and a word, so color is never the only signal.
 * Server-safe (no hooks).
 */

const OK = "border border-emerald-600/40 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200";
const BAD = "border border-danger/45 bg-danger/10 text-danger";
const WARN = "border border-accent/70 bg-accent/20 text-foreground";
const NEUTRAL = "border border-border bg-border/60 text-foreground";

export function RequestStatusBadge({ status, stale = false }: { status: GenerationRequest["status"]; stale?: boolean }) {
  if (status === "succeeded") {
    return (
      <span className={`badge whitespace-nowrap ${OK}`}>
        <span aria-hidden>✓</span> Succeeded
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className={`badge whitespace-nowrap ${BAD}`}>
        <span aria-hidden>✕</span> Failed
      </span>
    );
  }
  return (
    <span
      className={`badge whitespace-nowrap ${WARN}`}
      title={stale ? "Started a long time ago and never recorded a finish; it probably crashed." : undefined}
    >
      <span aria-hidden>⏳</span> {stale ? "Stuck?" : "Running"}
    </span>
  );
}

export function CallStatusBadge({ status }: { status: LlmResponse["status"] }) {
  if (status === "ok") {
    return (
      <span className={`badge whitespace-nowrap ${OK}`}>
        <span aria-hidden>✓</span> OK
      </span>
    );
  }
  if (status === "empty") {
    return (
      <span className={`badge whitespace-nowrap ${WARN}`} title="The model answered with no text (often a safety block).">
        <span aria-hidden>∅</span> Empty
      </span>
    );
  }
  return (
    <span className={`badge whitespace-nowrap ${BAD}`}>
      <span aria-hidden>✕</span> Error
    </span>
  );
}

export const KIND_LABEL: Record<GenerationRequest["kind"], string> = {
  upload: "Upload",
  more_jokes: "More jokes",
  describe: "Re-describe",
};

/** ✨ matches the "Re-describe with AI" option on Replace photo. */
export const KIND_ICON: Record<GenerationRequest["kind"], string> = {
  upload: "📤",
  more_jokes: "➕",
  describe: "✨",
};

export function KindBadge({ kind }: { kind: GenerationRequest["kind"] }) {
  return (
    <span className={`badge whitespace-nowrap ${NEUTRAL}`}>
      <span aria-hidden>{KIND_ICON[kind] ?? "•"}</span> {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

/** Joke style chosen for the run ("Mixed bag", "Dad jokes"...), or the raw value for unknown styles. */
export function styleLabel(style: string | null | undefined): string {
  if (!style) return "—";
  const known = Object.hasOwn(JOKE_STYLES, style) ? JOKE_STYLES[style as keyof typeof JOKE_STYLES] : null;
  return known ? `${known.emoji} ${known.label}` : style;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className={`badge whitespace-nowrap ${OK}`}>
      <span aria-hidden>●</span> Active
    </span>
  ) : (
    <span className={`badge whitespace-nowrap ${NEUTRAL} text-muted`}>
      <span aria-hidden>○</span> Inactive
    </span>
  );
}

/** Prompt chain status: Caption Arena only runs one chain, so an active chain can still be unused. */
export function ChainStatusBadge({ active, inUse }: { active: boolean; inUse: boolean }) {
  if (!active) return <ActiveBadge active={false} />;
  return inUse ? (
    <span className={`badge whitespace-nowrap ${OK}`} title="Active, and Caption Arena runs it.">
      <span aria-hidden>●</span> In use
    </span>
  ) : (
    <span className={`badge whitespace-nowrap ${NEUTRAL}`} title="Active, but Caption Arena doesn't run this chain.">
      <span aria-hidden>◐</span> Not used
    </span>
  );
}

const IO_LABEL: Record<string, string> = { image: "🖼️ Image", text: "📝 Text", json: "{ } JSON" };

/** "🖼️ Image → 📝 Text" */
export function IoBadge({ input, output }: { input: PromptChainStep["input_type"]; output: PromptChainStep["output_type"] }) {
  return (
    <span className={`badge whitespace-nowrap ${NEUTRAL}`} title={`Input: ${input}, output: ${output}`}>
      {IO_LABEL[input] ?? input} <span aria-hidden>→</span>
      <span className="sr-only">to</span> {IO_LABEL[output] ?? output}
    </span>
  );
}

/** "Attempt 2 · fallback" highlight for calls that weren't the first try. */
export function AttemptBadge({ attempt }: { attempt: number }) {
  if (attempt <= 1) return <span className="tabular-nums text-muted">1st try</span>;
  return (
    <span className={`badge whitespace-nowrap ${WARN}`} title="An earlier model failed or was busy, so Caption Arena fell back to this one.">
      <span aria-hidden>↪</span> Attempt {attempt}
    </span>
  );
}

/** "Step 1 · Describe the photo" */
export function StepLabel({ order, name }: { order: number; name: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
        {order}
      </span>
      <span className="truncate font-semibold">{name}</span>
    </span>
  );
}
