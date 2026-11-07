import { promptParts, type PlaceholderRules, type PlaceholderRunner } from "./pipeline-utils";

/** Colors and tooltips for {{placeholders}}: known names vs names the chain's runner doesn't supply. */
export const PLACEHOLDER_TONE = {
  known: "bg-accent/30 text-foreground ring-1 ring-accent/70",
  unknown: "bg-danger/10 text-danger ring-1 ring-danger/50",
} as const;
export const PLACEHOLDER_TIP: Record<PlaceholderRunner, Record<keyof typeof PLACEHOLDER_TONE, string>> = {
  arena: {
    known: "Filled in by Caption Arena at run time",
    unknown: "Unknown placeholder: Caption Arena replaces it with empty text",
  },
  tool: {
    known: "Filled in when the chain runs",
    unknown: "Unknown placeholder (or a later step): replaced with empty text",
  },
};

/** Inline text with {{placeholders}} marked (unknown names flagged). Server-safe (no hooks). */
export function PromptMarks({ text, rules }: { text: string; rules?: PlaceholderRules }) {
  const tips = PLACEHOLDER_TIP[rules?.runner ?? "arena"];
  return (
    <>
      {promptParts(text, rules).map((part, i) =>
        part.placeholder ? (
          <mark
            key={i}
            className={`rounded px-0.5 font-semibold ${PLACEHOLDER_TONE[part.known ? "known" : "unknown"]}`}
            title={tips[part.known ? "known" : "unknown"]}
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** A prompt rendered as a readable monospace block with {{placeholders}} highlighted. */
export function PromptText({ text, rules, className = "" }: { text: string; rules?: PlaceholderRules; className?: string }) {
  return (
    <pre
      className={`max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground sm:p-4 ${className}`}
    >
      <PromptMarks text={text} rules={rules} />
    </pre>
  );
}

/** Labelled prompt block ("System prompt", "User prompt"). */
export default function PromptBlock({
  label,
  hint,
  text,
  rules,
}: {
  label: string;
  hint?: string;
  text: string;
  /** Which {{placeholder}} names get values in this step (stepPlaceholderRules). */
  rules?: PlaceholderRules;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        {hint && <span className="font-normal normal-case tracking-normal">{hint}</span>}
      </p>
      <PromptText text={text} rules={rules} />
    </div>
  );
}

/**
 * Expandable text block (prompt or model response) using native
 * <details>/<summary>, so it works without JavaScript and with the keyboard.
 */
export function Expandable({
  label,
  text,
  open = false,
  highlight = false,
  tone = "default",
}: {
  label: string;
  text: string | null | undefined;
  open?: boolean;
  /** Highlight {{placeholders}} (prompts). */
  highlight?: boolean;
  tone?: "default" | "danger";
}) {
  if (!text) {
    return (
      <p className="text-xs text-muted">
        {label}: <span className="italic">not recorded</span>
      </p>
    );
  }
  const chars = text.length.toLocaleString("en-US");
  return (
    <details open={open} className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span className={tone === "danger" ? "text-danger" : ""}>
          <span aria-hidden className="mr-1.5 inline-block transition group-open:rotate-90">
            ▸
          </span>
          {label}
        </span>
        <span className="text-xs font-normal tabular-nums text-muted">{chars} chars</span>
      </summary>
      <div className="px-3 pb-3">
        {highlight ? (
          <PromptText text={text} />
        ) : (
          <pre
            className={`max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background p-3 font-mono text-[13px] leading-relaxed sm:p-4 ${tone === "danger" ? "text-danger" : "text-foreground"}`}
          >
            {text}
          </pre>
        )}
      </div>
    </details>
  );
}
