import { COLORS, bigNumber, percent, plural, signedDecimal } from "./chart-utils";

/**
 * Number-first figures: the one hero figure, KPI stat tiles and a tiny
 * up/down split meter. Server components (no hover needed: every value is
 * printed).
 */

export function SplitMeter({ up, down }: { up: number; down: number }) {
  const total = up + down;
  const parts = [
    { key: "up", label: up === 1 ? "upvote" : "upvotes", count: up, color: COLORS.up },
    { key: "down", label: down === 1 ? "downvote" : "downvotes", count: down, color: COLORS.down },
  ];
  const visible = parts.filter((p) => p.count > 0);
  return (
    <div>
      <div
        role="img"
        aria-label={`${plural(up, "upvote")} and ${plural(down, "downvote")}`}
        className="flex h-3 w-full gap-[2px]"
      >
        {total === 0 ? (
          <div className="h-full w-full rounded-[4px]" style={{ background: COLORS.mid }} />
        ) : (
          visible.map((p, i) => (
            <div
              key={p.key}
              className={`h-full ${i === 0 ? "rounded-l-[4px]" : ""} ${i === visible.length - 1 ? "rounded-r-[4px]" : ""}`}
              style={{ flexGrow: p.count, flexBasis: 0, background: p.color, minWidth: 3 }}
            />
          ))
        )}
      </div>
      <ul className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} />
            <span className="font-semibold">{bigNumber(p.count)}</span>
            <span className="text-muted">{p.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HeroFigure({
  laughRate,
  votes,
  upvotes,
  downvotes,
  jokes,
  netPerJoke,
}: {
  laughRate: number | null;
  votes: number;
  upvotes: number;
  downvotes: number;
  jokes: number;
  netPerJoke: number | null;
}) {
  return (
    <section aria-labelledby="hero-label" className="card flex flex-col p-6">
      <p id="hero-label" className="text-sm font-semibold text-muted">
        Laugh rate
      </p>
      {laughRate === null ? (
        <>
          <p className="mt-2 text-6xl font-semibold tracking-tight">—</p>
          <p className="mt-2 text-sm text-muted">No votes yet. This fills in after the first 👍 or 👎.</p>
        </>
      ) : (
        <>
          <p className="mt-2 text-6xl font-semibold tracking-tight">{percent(laughRate)}</p>
          <p className="mt-2 text-sm text-muted">
            of {plural(votes, "vote")} were a 👍. {netPerJoke !== null ? `That's ${signedDecimal(netPerJoke)} net per joke.` : ""}
          </p>
        </>
      )}
      <div className="mt-auto pt-6">
        <SplitMeter up={upvotes} down={downvotes} />
      </div>
      {jokes > 0 && votes === 0 ? (
        <p className="mt-3 text-xs text-muted">{plural(jokes, "joke")} waiting for votes.</p>
      ) : null}
    </section>
  );
}

export function StatTile({
  label,
  value,
  delta,
  note,
}: {
  label: string;
  value: string;
  /** New in the last 7 days; omit for ratios. */
  delta?: number | null;
  note?: string;
}) {
  return (
    <div className="card flex min-w-0 flex-col p-4 sm:p-5">
      <p className="truncate text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      {delta !== undefined && delta !== null ? (
        delta > 0 ? (
          <p className="mt-1 text-xs font-semibold text-[#006300] dark:text-[#0ca30c]">
            <span aria-hidden>▲ </span>
            {bigNumber(delta)} this week
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">None new this week</p>
        )
      ) : null}
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}
