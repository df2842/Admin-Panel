"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import ChartTooltip from "./ChartTooltip";
import { COLORS, barPath, longDate, niceStep, plural, shortDate } from "./chart-utils";
import { useChartWidth } from "./useChartWidth";

type Day = { date: string; up: number; down: number };

const MARGIN = { top: 18, right: 8, bottom: 40, left: 34 };
const PLOT_HEIGHT = 200;

function signedInt(n: number) {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Diverging column chart: upvotes rise above the baseline, downvotes hang
 * below it, on one shared scale. One column pair per UTC day.
 */
export default function VotesTimeline({ days }: { days: Day[] }) {
  const [ref, width] = useChartWidth<HTMLDivElement>(720);
  const [active, setActive] = useState<number | null>(null);

  const n = days.length;
  const maxUp = Math.max(0, ...days.map((d) => d.up));
  const maxDown = Math.max(0, ...days.map((d) => d.down));
  const step = niceStep(Math.max(maxUp, maxDown, 1), 3);
  const top = Math.max(step, Math.ceil(maxUp / step) * step);
  const bottom = Math.max(step, Math.ceil(maxDown / step) * step);
  const unit = PLOT_HEIGHT / (top + bottom);
  const y0 = MARGIN.top + top * unit;
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 60);
  const band = plotW / Math.max(n, 1);
  const barW = Math.max(2, Math.min(24, band * 0.62));
  const height = MARGIN.top + PLOT_HEIGHT + MARGIN.bottom;
  const xCenter = (i: number) => MARGIN.left + band * (i + 0.5);
  /** Bar length in px, leaving a 1px gap at the baseline; never thinner than 2px. */
  const barH = (count: number) => Math.max(2, count * unit - 1);

  const upTicks: number[] = [];
  for (let v = step; v <= top; v += step) upTicks.push(v);
  const downTicks: number[] = [];
  for (let v = step; v <= bottom; v += step) downTicks.push(v);

  const labelEvery = width < 480 ? 14 : 7;
  const xLabels = days.map((_, i) => i).filter((i) => (n - 1 - i) % labelEvery === 0);

  const peakUp = maxUp > 0 ? days.findIndex((d) => d.up === maxUp) : -1;
  const peakDown = maxDown > 0 ? days.findIndex((d) => d.down === maxDown) : -1;
  const lastWithVotes = days.findLastIndex((d) => d.up + d.down > 0);

  const move = (delta: number | "first" | "last") =>
    setActive((current) => {
      if (delta === "first") return 0;
      if (delta === "last") return n - 1;
      const from = current ?? (lastWithVotes >= 0 ? lastWithVotes : n - 1);
      return Math.min(n - 1, Math.max(0, from + delta));
    });

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const keys: Record<string, number | "first" | "last"> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      Home: "first",
      End: "last",
    };
    const delta = keys[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    move(delta);
  };

  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse") setActive(null);
  };

  const activeDay = active !== null ? days[active] : null;

  return (
    <div ref={ref} className="relative" onPointerLeave={onLeave}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full overflow-visible rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        role="group"
        aria-roledescription="chart"
        aria-label={`Upvotes and downvotes per day for the last ${n} days. Use the arrow keys to read each day.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? (lastWithVotes >= 0 ? lastWithVotes : n - 1))}
        onBlur={() => setActive(null)}
      >
        {/* Gridlines + y ticks (counts on both sides of the baseline) */}
        <g fontSize={11} fill={COLORS.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
          {upTicks.map((v) => (
            <g key={`u${v}`}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y0 - v * unit} y2={y0 - v * unit} stroke={COLORS.grid} />
              <text x={MARGIN.left - 8} y={y0 - v * unit} dy="0.35em" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {downTicks.map((v) => (
            <g key={`d${v}`}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y0 + v * unit} y2={y0 + v * unit} stroke={COLORS.grid} />
              <text x={MARGIN.left - 8} y={y0 + v * unit} dy="0.35em" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          <text x={MARGIN.left - 8} y={y0} dy="0.35em" textAnchor="end">
            0
          </text>
        </g>

        {/* Hover band behind the active day */}
        {active !== null ? (
          <rect
            x={MARGIN.left + band * active + 1}
            y={MARGIN.top - 6}
            width={Math.max(band - 2, 1)}
            height={PLOT_HEIGHT + 12}
            rx={4}
            fill={COLORS.grid}
            opacity={0.7}
          />
        ) : null}

        {/* Columns: 1px gap on each side of the baseline */}
        {days.map((d, i) => {
          const x = xCenter(i) - barW / 2;
          return (
            <g key={d.date}>
              {d.up > 0 ? (
                <path d={barPath(x, y0 - 1 - barH(d.up), barW, barH(d.up), "top")} fill={COLORS.up} />
              ) : null}
              {d.down > 0 ? <path d={barPath(x, y0 + 1, barW, barH(d.down), "bottom")} fill={COLORS.down} /> : null}
            </g>
          );
        })}

        {/* Baseline */}
        <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y0} y2={y0} stroke={COLORS.axis} />

        {/* Selective direct labels: the peak day on each side */}
        <g fontSize={11} fontWeight={600} fill={COLORS.ink2} textAnchor="middle">
          {peakUp >= 0 ? (
            <text x={xCenter(peakUp)} y={y0 - days[peakUp].up * unit - 6}>
              {days[peakUp].up}
            </text>
          ) : null}
          {peakDown >= 0 ? (
            <text x={xCenter(peakDown)} y={y0 + days[peakDown].down * unit + 14}>
              {days[peakDown].down}
            </text>
          ) : null}
        </g>

        {/* X axis labels */}
        <g fontSize={11} fill={COLORS.muted}>
          {xLabels.map((i) => {
            const x = xCenter(i);
            const anchor = x > width - 24 ? "end" : x < MARGIN.left + 16 ? "start" : "middle";
            return (
              <text key={i} x={x} y={height - 6} textAnchor={anchor}>
                {shortDate(days[i].date)}
              </text>
            );
          })}
        </g>

        {/* Hit targets: the whole day column, wider than the marks */}
        {days.map((d, i) => (
          <rect
            key={`hit-${d.date}`}
            x={MARGIN.left + band * i}
            y={MARGIN.top - 6}
            width={band}
            height={PLOT_HEIGHT + 12}
            fill="transparent"
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
          />
        ))}
      </svg>

      {activeDay && active !== null ? (
        <ChartTooltip
          x={xCenter(active)}
          y={Math.max(8, y0 - activeDay.up * unit - 6)}
          width={width}
          title={longDate(activeDay.date)}
          rows={[
            { value: `${activeDay.up}`, label: activeDay.up === 1 ? "upvote" : "upvotes", color: COLORS.up },
            { value: `${activeDay.down}`, label: activeDay.down === 1 ? "downvote" : "downvotes", color: COLORS.down },
            { value: signedInt(activeDay.up - activeDay.down), label: "net" },
          ]}
        />
      ) : null}
      <p className="sr-only" aria-live="polite">
        {activeDay
          ? `${longDate(activeDay.date)}: ${plural(activeDay.up, "upvote")}, ${plural(activeDay.down, "downvote")}.`
          : ""}
      </p>
    </div>
  );
}
