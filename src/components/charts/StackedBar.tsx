"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import ChartTooltip from "./ChartTooltip";
import { percent, plural } from "./chart-utils";
import { useChartWidth } from "./useChartWidth";

export type Segment = { key: string; label: string; count: number; color: string };

/**
 * One 100% stacked bar (part-to-whole), ordered negative -> neutral ->
 * positive. Segments are separated by a 2px surface gap and only the two
 * outer ends are rounded. A legend with direct counts sits underneath, so the
 * tooltip is never the only way to read a value.
 */
export default function StackedBar({ segments, unit }: { segments: Segment[]; unit: [string, string] }) {
  const [ref, width] = useChartWidth<HTMLDivElement>(360);
  const [active, setActive] = useState<number | null>(null);

  const total = segments.reduce((s, seg) => s + seg.count, 0);
  const visible = segments.map((seg, i) => ({ ...seg, i })).filter((seg) => seg.count > 0);
  const gapTotal = Math.max(0, visible.length - 1) * 2;

  // Left edge (px) of each visible segment, for tooltip placement.
  const starts: Record<number, number> = {};
  let cursor = 0;
  for (const seg of visible) {
    const w = total ? ((width - gapTotal) * seg.count) / total : 0;
    starts[seg.i] = cursor + w / 2;
    cursor += w + 2;
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta || !visible.length) return;
    e.preventDefault();
    setActive((cur) => {
      const pos = visible.findIndex((v) => v.i === cur);
      const next = Math.min(visible.length - 1, Math.max(0, (pos < 0 ? -1 : pos) + delta));
      return visible[next].i;
    });
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse") setActive(null);
  };

  const activeSeg = active !== null ? segments[active] : null;
  const describe = (seg: Segment) =>
    `${plural(seg.count, unit[0], unit[1])} ${seg.label.toLowerCase()} (${percent(total ? seg.count / total : 0)})`;

  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={onLeave}>
        <div
          role="group"
          aria-roledescription="chart"
          aria-label={`${segments.map(describe).join(", ")}. Use the arrow keys to read each part.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((a) => a ?? visible[0]?.i ?? null)}
          onBlur={() => setActive(null)}
          className="flex h-6 w-full gap-[2px] rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          {visible.map((seg, pos) => (
            <div
              key={seg.key}
              className={`h-full ${pos === 0 ? "rounded-l-[4px]" : ""} ${
                pos === visible.length - 1 ? "rounded-r-[4px]" : ""
              } ${active === seg.i ? "outline-2 outline-offset-1 outline-foreground" : ""}`}
              style={{ flexGrow: seg.count, flexBasis: 0, background: seg.color, minWidth: 3 }}
              onPointerEnter={() => setActive(seg.i)}
              onPointerDown={() => setActive(seg.i)}
            />
          ))}
        </div>
        {activeSeg && active !== null ? (
          <ChartTooltip
            x={starts[active] ?? 0}
            y={0}
            width={width}
            title={activeSeg.label}
            rows={[
              { value: `${activeSeg.count}`, label: activeSeg.count === 1 ? unit[0] : unit[1], color: activeSeg.color },
              { value: percent(total ? activeSeg.count / total : 0), label: "of the total" },
            ]}
          />
        ) : null}
        <p className="sr-only" aria-live="polite">
          {activeSeg ? `${describe(activeSeg)}.` : ""}
        </p>
      </div>

      {/* Legend doubling as direct labels */}
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {segments.map((seg) => (
          <li key={seg.key} className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: seg.color }} />
            <span className="font-semibold">{seg.count}</span>
            <span className="text-muted">
              {seg.label} · {percent(total ? seg.count / total : 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
