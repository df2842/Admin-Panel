/**
 * Pure helpers for the AI pipeline screens (prompt chains, generation
 * requests, LLM responses). No server imports, so client components (the
 * mix editor) and server actions can share them.
 */

/* ---- Prompt chain mix ---------------------------------------------------- */

/** Mirrors `weight integer check (weight between 0 and 100)` in week7-domain.sql. */
export const MIX_WEIGHT_MIN = 0;
export const MIX_WEIGHT_MAX = 100;

export function isMixWeight(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIX_WEIGHT_MIN && value <= MIX_WEIGHT_MAX;
}

/** Parses what an admin typed into a weight field; null unless it is a whole number 0-100. */
export function parseWeight(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return isMixWeight(n) ? n : null;
}

/**
 * Splits a batch of `size` jokes across flavors in proportion to their
 * weights, using largest-remainder (Hamilton) rounding: every flavor gets the
 * whole part of its exact share, then the jokes left over go to the largest
 * remainders. Ties go to the flavor listed first. Integer math only, so
 * 25/25/25/25 always gives exactly 1/1/1/1.
 */
export function splitBatch<K>(items: { key: K; weight: number }[], size: number): Map<K, number> {
  const out = new Map<K, number>(items.map((i) => [i.key, 0]));
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  if (total <= 0 || size <= 0) return out;

  const quotas = items.map((item, index) => {
    const scaled = Math.max(0, item.weight) * size;
    const base = Math.floor(scaled / total);
    return { key: item.key, index, base, remainder: scaled - base * total };
  });
  let left = size - quotas.reduce((sum, q) => sum + q.base, 0);
  for (const q of quotas) out.set(q.key, q.base);

  const byRemainder = quotas
    .filter((q) => q.remainder > 0)
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const q of byRemainder) {
    if (left <= 0) break;
    out.set(q.key, q.base + 1);
    left -= 1;
  }
  return out;
}

/* ---- Prompts ------------------------------------------------------------- */

/**
 * `{{count}}`, `{{ style }}` ... exactly what Caption Arena's fill() matches
 * (Hello-World/src/lib/pipeline-config.ts). `{{a.b}}` or `{{a-b}}` is not a
 * placeholder there: it reaches the model as typed.
 */
const PLACEHOLDER = /(\{\{\s*\w+\s*\}\})/g;
const PLACEHOLDER_NAME = /^\{\{\s*(\w+)\s*\}\}$/;

/**
 * The names Caption Arena supplies to text (joke) steps; fill() turns any other
 * name into empty text. Image (describe) steps get no values at all.
 */
export const KNOWN_PLACEHOLDERS: readonly string[] = ["count", "style", "description"];

export function isKnownPlaceholder(name: string, inputType: string = "text"): boolean {
  return inputType !== "image" && KNOWN_PLACEHOLDERS.includes(name);
}

/** Splits prompt text into plain and placeholder parts (for highlighting). */
export function promptParts(
  text: string,
  inputType: string = "text",
): { text: string; placeholder: boolean; known: boolean }[] {
  return text
    .split(PLACEHOLDER)
    .filter((part) => part !== "")
    .map((part) => {
      const name = PLACEHOLDER_NAME.exec(part)?.[1];
      return { text: part, placeholder: name !== undefined, known: name !== undefined && isKnownPlaceholder(name, inputType) };
    });
}

/** Unique placeholder names used in the given prompts, in order of appearance. */
export function placeholdersIn(...texts: string[]): string[] {
  const names = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(PLACEHOLDER)) names.add(match[1].replace(/[{}\s]/g, ""));
  }
  return [...names];
}

/* ---- Numbers, durations and rates ---------------------------------------- */

/** "850 ms", "4.2 s", "1m 05s", "2h 03m". */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 999.5) return `${Math.round(ms)} ms`;
  if (ms < 59_500) return `${(ms / 1000).toFixed(ms < 9_950 ? 1 : 0)} s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Milliseconds between two ISO timestamps, or null if either is missing. */
export function durationMs(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Number.isFinite(ms) ? Math.max(0, ms) : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The one definition of "fallback rate" (dashboard and /llm-responses): of
 * the pipeline steps (request + step) that succeeded, how many succeeded only
 * on a backup model (attempt > 1; attempts restart at 1 for every step). A
 * step where every model failed shows up as failed calls, not as a fallback.
 */
export function fallbackCounts(
  calls: { request_id: string; step_order: number; attempt: number | null; status: string }[],
): { fellBack: number; okSteps: number } {
  const okSteps = new Map<string, boolean>();
  for (const c of calls) {
    if (c.status !== "ok") continue;
    const key = `${c.request_id}#${c.step_order}`;
    okSteps.set(key, (okSteps.get(key) ?? false) || (c.attempt ?? 1) > 1);
  }
  let fellBack = 0;
  for (const v of okSteps.values()) if (v) fellBack += 1;
  return { fellBack, okSteps: okSteps.size };
}

/** "42%" or "—" when there is nothing to divide by. */
export function percent(part: number, whole: number): string {
  if (whole <= 0) return "—";
  const p = (part / whole) * 100;
  return `${p > 0 && p < 1 ? p.toFixed(1) : Math.round(p)}%`;
}

/** Single-line excerpt for table cells. */
export function excerpt(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** A run still "running" after this long almost certainly crashed without finishing. */
export const STALE_RUN_MS = 10 * 60_000;
