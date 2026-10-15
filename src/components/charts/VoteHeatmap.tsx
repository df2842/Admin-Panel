"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import ChartTooltip from "./ChartTooltip";
import { COLORS, WEEKDAYS, WEEKDAYS_LONG, heatLegend, heatStep, hourLabel, hourTick, plural } from "./chart-utils";
import { useChartWidth } from "./useChartWidth";

const LABEL_W = 38;
const AXIS_H = 20;
const GAP = 2;

type Cell = { day: number; hour: number };

/**
 * Weekday x hour-of-day heatmap (UTC) on the one-hue sequential ramp. Each
 * cell is its own hover target; keyboard users move with the arrow keys.
 */
export default function VoteHeatmap({
  counts,
  max,
  start,
}: {
  counts: number[][];
  max: number;
  /** Cell to show first when the chart gets keyboard focus. */
  start: Cell | null;
}) {
  const [ref, width] = useChartWidth<HTMLDivElement>(720);
  const [active, setActive] = useState<Cell | null>(null);

  const cellW = Math.max(8, (width - LABEL_W) / 24);
  const cellH = Math.min(30, Math.max(18, cellW * 0.85));
  const height = AXIS_H + cellH * 7;
  const tickEvery = cellW >= 26 ? 2 : cellW >= 16 ? 3 : 6;

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setActive((cur) => {
      const from = cur ?? start ?? { day: 0, hour: 0 };
      return {
        day: Math.min(6, Math.max(0, from.day + move[0])),
        hour: Math.min(23, Math.max(0, from.hour + move[1])),
      };
    });
  };

  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse") setActive(null);
  };

  const activeCount = active ? counts[active.day][active.hour] : 0;
  const slotLabel = active
    ? `${WEEKDAYS_LONG[active.day]}, ${hourLabel(active.hour)} to ${hourLabel(active.hour + 1)} UTC`
    : "";

  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={onLeave}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full overflow-visible rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          role="group"
          aria-roledescription="chart"
          aria-label="Votes by weekday and hour of day, in UTC. Use the arrow keys to read each hour."
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((a) => a ?? start ?? { day: 0, hour: 0 })}
          onBlur={() => setActive(null)}
        >
          {/* Hour ticks */}
          <g fontSize={10} fill={COLORS.muted} textAnchor="middle">
            {Array.from({ length: 24 }, (_, h) => h)
              .filter((h) => h % tickEvery === 0)
              .map((h) => (
                <text key={h} x={LABEL_W + cellW * h + cellW / 2} y={AXIS_H - 7}>
                  {hourTick(h)}
                </text>
              ))}
          </g>
          {/* Weekday labels */}
          <g fontSize={11} fill={COLORS.muted}>
            {WEEKDAYS.map((d, i) => (
              <text key={d} x={0} y={AXIS_H + cellH * i + cellH / 2} dy="0.35em">
                {d}
              </text>
            ))}
          </g>
          {/* Cells: a 2px surface gap between neighbours */}
          {counts.map((row, day) =>
            row.map((count, hour) => (
              <rect
                key={`${day}-${hour}`}
                x={LABEL_W + cellW * hour + GAP / 2}
                y={AXIS_H + cellH * day + GAP / 2}
                width={cellW - GAP}
                height={cellH - GAP}
                rx={3}
                style={{ fill: `var(--seq-${heatStep(count, max)})` }}
                onPointerEnter={() => setActive({ day, hour })}
                onPointerDown={() => setActive({ day, hour })}
              />
            )),
          )}
          {/* Active cell lifts with an ink outline */}
          {active ? (
            <rect
              x={LABEL_W + cellW * active.hour + GAP / 2}
              y={AXIS_H + cellH * active.day + GAP / 2}
              width={cellW - GAP}
              height={cellH - GAP}
              rx={3}
              fill="none"
              stroke={COLORS.ink}
              strokeWidth={1.5}
              pointerEvents="none"
            />
          ) : null}
        </svg>

        {active ? (
          <ChartTooltip
            x={LABEL_W + cellW * (active.hour + 0.5)}
            y={AXIS_H + cellH * active.day}
            width={width}
            title={slotLabel}
            rows={[{ value: `${activeCount}`, label: activeCount === 1 ? "vote" : "votes" }]}
          />
        ) : null}
        <p className="sr-only" aria-live="polite">
          {active ? `${slotLabel}: ${plural(activeCount, "vote")}.` : ""}
        </p>
      </div>

      {/* Scale legend: the exact bins the cells use */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
        <span>Votes per hour</span>
        <ul className="flex flex-wrap items-center gap-1.5">
          {heatLegend(max).map((bin) => (
            <li key={bin.step} className="flex items-center gap-1">
              <span
                aria-hidden
                className="h-3.5 w-5 rounded-[3px]"
                style={{ background: `var(--seq-${bin.step})` }}
              />
              <span className="tabular-nums">{bin.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
