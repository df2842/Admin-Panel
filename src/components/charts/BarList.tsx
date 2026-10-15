"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import ChartTooltip, { type TooltipRow } from "./ChartTooltip";
import { COLORS, barPath } from "./chart-utils";
import { useChartWidth } from "./useChartWidth";

export type BarDatum = {
  key: string;
  label: string;
  sublabel?: string;
  /** null = nothing to plot yet (e.g. no votes); `valueLabel` explains why. */
  value: number | null;
  valueLabel: string;
  tooltipTitle: string;
  tooltipRows: TooltipRow[];
};

const LABEL_H = 20;
const BAR_H = 18;
const ROW_GAP = 16;
const ROW_H = LABEL_H + BAR_H + ROW_GAP;
const VALUE_ROOM = 64;

/**
 * Horizontal bars with the category label above each bar (works in narrow
 * cards). `tone="series"` paints every bar in series 1; `tone="diverging"`
 * grows positive values right in blue and negative values left in red from a
 * shared zero baseline. Every bar carries its value at the tip.
 */
export default function BarList({
  data,
  tone,
  ariaLabel,
}: {
  data: BarDatum[];
  tone: "series" | "diverging";
  ariaLabel: string;
}) {
  const [ref, width] = useChartWidth<HTMLDivElement>(360);
  const [active, setActive] = useState<number | null>(null);

  const values = data.map((d) => d.value ?? 0);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const leftRoom = lo < 0 ? VALUE_ROOM : 0;
  const plotW = Math.max(width - leftRoom - VALUE_ROOM, 40);
  const scale = (v: number) => leftRoom + ((v - lo) / span) * plotW;
  const x0 = scale(0);
  const height = data.length * ROW_H - ROW_GAP + 4;

  const colorFor = (v: number) => (tone === "series" ? COLORS.series1 : v >= 0 ? COLORS.up : COLORS.down);

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    setActive((cur) => Math.min(data.length - 1, Math.max(0, (cur ?? -1) + delta)));
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse") setActive(null);
  };

  const activeDatum = active !== null ? data[active] : null;

  return (
    <div ref={ref} className="relative" onPointerLeave={onLeave}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full overflow-visible rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel} Use the arrow keys to read each bar.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? 0)}
        onBlur={() => setActive(null)}
      >
        {data.map((d, i) => {
          const rowY = i * ROW_H;
          const barY = rowY + LABEL_H;
          const v = d.value;
          const xEnd = v === null ? x0 : scale(v);
          const isNeg = v !== null && v < 0;
          const barX = Math.min(x0, xEnd);
          const barW = Math.abs(xEnd - x0);
          const tipX = v === null ? x0 + 6 : isNeg ? xEnd - 6 : xEnd + 6;
          return (
            <g key={d.key}>
              {active === i ? (
                <rect x={-6} y={rowY - 4} width={width + 12} height={ROW_H - ROW_GAP + 8} rx={8} fill={COLORS.grid} opacity={0.6} />
              ) : null}
              <text x={0} y={rowY + 14} fontSize={13} fontWeight={600} fill={COLORS.ink}>
                {d.label}
                {d.sublabel ? (
                  <tspan fontWeight={400} fill={COLORS.muted} fontSize={12}>
                    {`  ${d.sublabel}`}
                  </tspan>
                ) : null}
              </text>
              {v !== null && barW > 0 ? (
                <path d={barPath(barX, barY, Math.max(barW, 2), BAR_H, isNeg ? "left" : "right")} fill={colorFor(v)} />
              ) : null}
              <text
                x={tipX}
                y={barY + BAR_H / 2}
                dy="0.35em"
                fontSize={12}
                fontWeight={v === null ? 400 : 600}
                fill={v === null ? COLORS.muted : COLORS.ink2}
                textAnchor={isNeg ? "end" : "start"}
              >
                {d.valueLabel}
              </text>
              {/* Hit target: the whole row, label included */}
              <rect
                x={0}
                y={rowY - 4}
                width={width}
                height={ROW_H - ROW_GAP + 8}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              />
            </g>
          );
        })}
        {/* Zero baseline, drawn per bar so it never crosses the labels */}
        {data.map((d, i) => (
          <line
            key={`base-${d.key}`}
            x1={x0}
            x2={x0}
            y1={i * ROW_H + LABEL_H - 3}
            y2={i * ROW_H + LABEL_H + BAR_H + 3}
            stroke={COLORS.axis}
            pointerEvents="none"
          />
        ))}
      </svg>

      {activeDatum && active !== null ? (
        <ChartTooltip
          x={Math.min(Math.max(activeDatum.value === null ? x0 : scale(activeDatum.value), 0), width)}
          y={active * ROW_H + LABEL_H - 2}
          width={width}
          title={activeDatum.tooltipTitle}
          rows={activeDatum.tooltipRows}
        />
      ) : null}
      <p className="sr-only" aria-live="polite">
        {activeDatum
          ? `${activeDatum.tooltipTitle}: ${activeDatum.tooltipRows.map((r) => `${r.value} ${r.label}`).join(", ")}.`
          : ""}
      </p>
    </div>
  );
}
