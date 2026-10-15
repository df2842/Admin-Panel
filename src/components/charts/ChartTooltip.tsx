export type TooltipRow = { value: string; label: string; color?: string };

/**
 * Hover/focus readout positioned over a chart (x, y in the chart's own pixel
 * space). The value leads and the label follows; series are keyed with a short
 * line in the series color. Text is rendered by React, so labels from the
 * database are always escaped.
 */
export default function ChartTooltip({
  x,
  y,
  width,
  title,
  rows,
}: {
  x: number;
  y: number;
  width: number;
  title: string;
  rows: TooltipRow[];
}) {
  // Keep the box inside the chart without measuring it.
  const shift = x < 96 ? "0%" : x > width - 96 ? "-100%" : "-50%";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-10 w-max min-w-36 max-w-64 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg"
      style={{ left: x, top: y, transform: `translate(${shift}, calc(-100% - 8px))` }}
    >
      <p className="font-medium text-muted">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 whitespace-nowrap">
            {row.color ? (
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: row.color }} />
            ) : null}
            <span className="font-semibold text-foreground tabular-nums">{row.value}</span>
            <span className="text-muted">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
