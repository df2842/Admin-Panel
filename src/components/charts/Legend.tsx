export type LegendItem = { label: string; color: string; shape?: "rect" | "line" };

/** Series legend: a swatch that mirrors the mark, text in ink (never the series color). */
export default function Legend({ items, className = "" }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted ${className}`}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={item.shape === "line" ? "h-0.5 w-4 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"}
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
