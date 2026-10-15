/**
 * Pure helpers shared by the dashboard charts (safe on server and client).
 * Dates are formatted by hand, not with Intl, so the server render and the
 * browser hydrate to exactly the same strings.
 */

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Chart color roles (CSS variables defined in globals.css, light + dark). */
export const COLORS = {
  up: "var(--div-pos)",
  down: "var(--div-neg)",
  mid: "var(--div-mid)",
  series1: "var(--series-1)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  ink: "var(--chart-ink)",
  ink2: "var(--chart-ink-2)",
  muted: "var(--chart-muted)",
} as const;

/** "2026-10-09" -> "Oct 9" */
export function shortDate(isoDay: string): string {
  const [, m, d] = isoDay.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

/** "2026-10-09" -> "Fri, Oct 9" */
export function longDate(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${WEEKDAYS[weekday]}, ${MONTHS[m - 1]} ${d}`;
}

/** 0 -> "12 AM", 13 -> "1 PM" */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${h < 12 ? "AM" : "PM"}`;
}

/** Compact axis label: 0 -> "12a", 15 -> "3p" */
export function hourTick(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${hour < 12 ? "a" : "p"}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** 0.714 -> "71%" */
export function percent(ratio: number | null | undefined): string {
  return ratio === null || ratio === undefined ? "—" : `${Math.round(ratio * 100)}%`;
}

/** Signed with one decimal, never "-0.0": 1.25 -> "+1.3", -0.5 -> "-0.5", 0 -> "0.0" */
export function signedDecimal(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined) return "—";
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return rounded > 0 ? `+${rounded.toFixed(digits)}` : rounded.toFixed(digits);
}

/** Display big numbers: 1,284 stays exact, 12,900 -> "12.9K". */
export function bigNumber(n: number): string {
  if (Math.abs(n) < 10_000) return n.toLocaleString("en-US");
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** A "nice" tick step (1, 2, 5 x 10^k) so that `max` spans about `target` steps. */
export function niceStep(max: number, target = 4): number {
  if (max <= 0) return 1;
  const raw = max / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return Math.max(1, nice * power);
}

/**
 * SVG path for a bar with its two data-end corners rounded and the baseline
 * end square. `end` says which side the data end is on.
 */
export function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  end: "top" | "bottom" | "left" | "right",
  radius = 4,
): string {
  if (w <= 0 || h <= 0) return "";
  const r = Math.max(0, Math.min(radius, end === "top" || end === "bottom" ? Math.min(w / 2, h) : Math.min(h / 2, w)));
  const x2 = x + w;
  const y2 = y + h;
  switch (end) {
    case "top":
      return `M${x},${y2}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x2 - r}A${r},${r} 0 0 1 ${x2},${y + r}V${y2}Z`;
    case "bottom":
      return `M${x},${y}H${x2}V${y2 - r}A${r},${r} 0 0 1 ${x2 - r},${y2}H${x + r}A${r},${r} 0 0 1 ${x},${y2 - r}Z`;
    case "right":
      return `M${x},${y}H${x2 - r}A${r},${r} 0 0 1 ${x2},${y + r}V${y2 - r}A${r},${r} 0 0 1 ${x2 - r},${y2}H${x}Z`;
    case "left":
      return `M${x2},${y}V${y2}H${x + r}A${r},${r} 0 0 1 ${x},${y2 - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
  }
}

/** Heatmap step 0..6 on the sequential ramp: 0 = no votes, 6 = the busiest slot. */
export function heatStep(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(6, Math.max(1, Math.ceil((count * 6) / max)));
}

/** Legend bins that match heatStep exactly (empty steps are skipped). */
export function heatLegend(max: number): { step: number; label: string }[] {
  const bins = [{ step: 0, label: "0" }];
  for (let step = 1; step <= 6; step++) {
    const lo = Math.floor(((step - 1) * max) / 6) + 1;
    const hi = Math.floor((step * max) / 6);
    if (lo > hi) continue;
    bins.push({ step, label: lo === hi ? `${lo}` : `${lo}–${hi}` });
  }
  return bins;
}
