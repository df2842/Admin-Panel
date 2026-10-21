import type { ReactNode } from "react";

/**
 * Server-safe display pieces for the CRUD screens (no hooks, no client JS),
 * used to render each row's `view` and the page sections.
 */

/** Cuts text to `max` characters (whole code points) with an ellipsis. */
export function shorten(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`
    : text;
}

/** A titled block on a CRUD page (e.g. "LLM providers"). */
export function Section({
  id,
  title,
  count,
  description,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
      <div>
        <h2 id={`${id}-title`} className="flex flex-wrap items-center gap-2 text-xl font-bold">
          {title}
          {count !== undefined && <span className="badge bg-border text-xs text-muted tabular-nums">{count}</span>}
        </h2>
        {description && <div className="mt-1 max-w-3xl text-sm text-muted">{description}</div>}
      </div>
      {children}
    </section>
  );
}

/** Gray "Off" badge for inactive records. */
export function OffBadge({ children = "Off" }: { children?: ReactNode }) {
  return <span className="badge whitespace-nowrap border border-border bg-background text-muted">{children}</span>;
}

/** Neutral badge (flavor, chain, provider…). */
export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="badge whitespace-nowrap bg-border/70 text-foreground">
      {children}
    </span>
  );
}

/** Inline monospace value such as a slug, model id or domain. */
export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-border/60 px-1.5 py-0.5 font-mono text-[0.85em] break-all">{children}</code>;
}

/**
 * Muted line of small facts separated by dots. Falsy items are skipped. Each
 * dot sticks to the fact before it, so a wrapped line never starts with one.
 */
export function MetaLine({ items }: { items: ReactNode[] }) {
  const shown = items.filter((item) => item !== null && item !== undefined && item !== false && item !== "");
  if (shown.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {shown.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {item}
          {i < shown.length - 1 && <span aria-hidden>·</span>}
        </span>
      ))}
    </p>
  );
}

/** External link that opens in a new tab. */
export function OutLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
      {children} <span aria-hidden>↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Search box for a FilterBar (submits on Enter or the button). */
export function SearchField({ value, placeholder }: { value: string; placeholder: string }) {
  return (
    <label className="flex min-w-0 flex-1 basis-64 flex-col">
      <span className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Search</span>
      <span className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={value}
          maxLength={100}
          placeholder={placeholder}
          autoComplete="off"
          className="input h-11 min-w-0 flex-1"
        />
        <button type="submit" className="btn btn-primary h-11 px-5">
          Search
        </button>
      </span>
    </label>
  );
}

/** Amber (warning) or green (good) one-line callout. */
export function Callout({ tone, children }: { tone: "warning" | "good" | "info"; children: ReactNode }) {
  const colors =
    tone === "warning"
      ? "border-amber-400/70 bg-amber-50 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
      : tone === "good"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
        : "border-border bg-card text-foreground";
  return <div className={`rounded-2xl border-2 px-4 py-3 text-sm ${colors}`}>{children}</div>;
}
