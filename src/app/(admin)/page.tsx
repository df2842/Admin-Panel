import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import BarList, { type BarDatum } from "@/components/charts/BarList";
import ChartCard from "@/components/charts/ChartCard";
import Crowd from "@/components/charts/Crowd";
import DataTable from "@/components/charts/DataTable";
import EmptyState from "@/components/charts/EmptyState";
import { HeroFigure, StatTile } from "@/components/charts/Figures";
import { BestPhotos, ControversialJokes, FunniestJokes } from "@/components/charts/Leaderboards";
import Legend from "@/components/charts/Legend";
import RefreshButton from "@/components/charts/RefreshButton";
import StackedBar from "@/components/charts/StackedBar";
import VoteHeatmap from "@/components/charts/VoteHeatmap";
import VotesTimeline from "@/components/charts/VotesTimeline";
import {
  COLORS,
  WEEKDAYS,
  WEEKDAYS_LONG,
  bigNumber,
  hourLabel,
  hourTick,
  longDate,
  percent,
  plural,
  signedDecimal,
} from "@/components/charts/chart-utils";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime, signed } from "@/lib/format";
import { getDashboardStats, RECENT_DAYS, TIMELINE_DAYS, type DashboardStats } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

const MAIN_APP_URL = "https://hello-world-the-humor-project.vercel.app";

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const result = await getDashboardStats(supabase).then(
    (stats) => ({ stats, error: null }),
    (e: unknown) => ({ stats: null, error: e instanceof Error ? e.message : "Unknown error" }),
  );

  if (result.stats === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader />
        <div role="alert" className="card border-danger/40 p-6">
          <p className="text-lg font-semibold text-danger">Couldn&apos;t load the dashboard</p>
          <p className="mt-2 text-sm text-muted">The database said: {result.error}</p>
          <p className="mt-4 text-sm text-muted">
            Check that the Week 4 and Week 6 SQL migrations ran, then try again.
          </p>
          <div className="mt-5">
            <RefreshButton />
          </div>
        </div>
      </div>
    );
  }

  const s = result.stats;
  const t = s.totals;
  const nothingYet = t.photos === 0 && t.jokes === 0 && t.votes === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <PageHeader updated={s.generatedAt} />

      {!s.profiles.ok ? (
        <div role="status" className="card border-accent/60 bg-accent/10 p-4 text-sm">
          <p className="font-semibold">User profiles couldn&apos;t be read, so names and avatars are hidden.</p>
          <p className="mt-1 text-muted">
            The user count only includes people seen in the data. Everything else is live. ({s.profiles.error})
          </p>
        </div>
      ) : null}

      {nothingYet ? (
        <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold">Nothing to show yet 🌱</p>
            <p className="mt-1 text-sm text-muted">
              Stats appear here as soon as people upload photos and vote in Caption Arena.
            </p>
          </div>
          <a href={MAIN_APP_URL} target="_blank" rel="noreferrer" className="btn btn-primary btn-lg shrink-0">
            Open Caption Arena ↗
          </a>
        </div>
      ) : null}

      <section aria-label="Key numbers" className="space-y-2">
        <div className="grid gap-4 lg:grid-cols-3">
          <HeroFigure
            laughRate={t.laughRate}
            votes={t.votes}
            upvotes={t.upvotes}
            downvotes={t.downvotes}
            jokes={t.jokes}
            netPerJoke={t.jokes && t.votes ? (t.upvotes - t.downvotes) / t.jokes : null}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-2 xl:grid-cols-3">
            <StatTile
              label={t.usersSource === "profiles" ? "Users" : "Active users"}
              value={bigNumber(t.users)}
              delta={s.recent.users}
              note={t.usersSource === "profiles" ? "Signed-in accounts" : "Seen uploading or voting"}
            />
            <StatTile label="Photos" value={bigNumber(t.photos)} delta={s.recent.photos} />
            <StatTile
              label="AI jokes"
              value={bigNumber(t.aiJokes)}
              delta={s.recent.jokes}
              note={t.jokes > t.aiJokes ? `+${t.jokes - t.aiJokes} written by hand` : undefined}
            />
            <StatTile
              label="Votes cast"
              value={bigNumber(t.votes)}
              delta={s.recent.votes}
              note={t.voters ? `By ${plural(t.voters, "voter")}` : undefined}
            />
            <StatTile
              label="Jokes per photo"
              value={t.jokesPerPhoto === null ? "—" : t.jokesPerPhoto.toFixed(1)}
              note={t.photos ? `Across ${plural(t.photos, "photo")}` : "No photos yet"}
            />
            <StatTile
              label="Votes per joke"
              value={t.votesPerJoke === null ? "—" : t.votesPerJoke.toFixed(1)}
              note={t.jokes ? `${t.votedJokes} of ${plural(t.jokes, "joke")} voted on` : "No jokes yet"}
            />
          </div>
        </div>
        <p className="text-right text-xs text-muted">“This week” means the last {RECENT_DAYS} days.</p>
      </section>

      <Section
        title="Voting activity"
        description="When the crowd shows up, and how it feels."
        action={
          <Link href="/votes" className="btn btn-secondary btn-sm">
            All votes →
          </Link>
        }
      >
        <TimelineCard s={s} />
        <HeatmapCard s={s} />
      </Section>

      <Section
        title="Leaderboards"
        description="The jokes and photos people liked most, and the ones that split the room."
        action={
          <Link href="/media" className="btn btn-secondary btn-sm">
            Manage media →
          </Link>
        }
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Funniest jokes" subtitle="Highest net score: 👍 minus 👎.">
            <FunniestJokes jokes={s.funniest} anyVotes={t.votes > 0} />
          </Panel>
          <Panel title="Most controversial" subtitle="Both sides voted. Ranked by the size of the smaller side.">
            <ControversialJokes jokes={s.controversial} anyVotes={t.votes > 0} />
          </Panel>
        </div>
        <Panel title="Best photos" subtitle="Ranked by the average score of their jokes that have votes.">
          <BestPhotos photos={s.bestPhotos} anyPhotos={t.photos > 0} />
        </Panel>
      </Section>

      <Section
        title="The crowd"
        description="The personalities behind the votes."
        action={
          <Link href="/users" className="btn btn-secondary btn-sm">
            All users →
          </Link>
        }
      >
        <Crowd crowd={s.crowd} />
      </Section>

      <Section title="What makes a joke land" description="Verdicts, joke length and the model that wrote it.">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <VerdictCard s={s} />
          <LengthCard s={s} />
          <ModelCard s={s} />
        </div>
      </Section>
    </div>
  );
}

/* ---- Layout pieces ------------------------------------------------------- */

function PageHeader({ updated }: { updated?: string }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-muted">How Caption Arena is doing right now. All times are UTC.</p>
      </div>
      {updated ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted">Updated {formatDateTime(updated)}</p>
          <RefreshButton />
        </div>
      ) : null}
    </header>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card min-w-0 p-5 sm:p-6">
      <h3 className="text-base font-semibold">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/70 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold">{value}</dd>
    </div>
  );
}

/* ---- Chart cards ---------------------------------------------------------- */

function TimelineCard({ s }: { s: DashboardStats }) {
  const up = s.daily.reduce((n, d) => n + d.up, 0);
  const down = s.daily.reduce((n, d) => n + d.down, 0);
  const activeDays = s.daily.filter((d) => d.up + d.down > 0);
  const quietDays = TIMELINE_DAYS - activeDays.length;
  const empty = up + down === 0;

  return (
    <ChartCard
      title={`Votes, last ${TIMELINE_DAYS} days`}
      subtitle={
        empty
          ? "No votes in this window yet."
          : `${plural(up, "upvote")} and ${plural(down, "downvote")} across ${plural(activeDays.length, "active day")}. Net ${signed(up - down)}.`
      }
      legend={
        empty ? null : (
          <Legend
            items={[
              { label: "Upvotes (above the line)", color: COLORS.up },
              { label: "Downvotes (below the line)", color: COLORS.down },
            ]}
          />
        )
      }
      chart={
        empty ? (
          <EmptyState icon="🗳️" title={`No votes in the last ${TIMELINE_DAYS} days`}>
            Each day&apos;s 👍 and 👎 will show up here as people vote.
          </EmptyState>
        ) : (
          <VotesTimeline days={s.daily} />
        )
      }
      table={
        empty ? null : (
          <DataTable
            caption={`Votes per day, last ${TIMELINE_DAYS} days`}
            columns={[
              { label: "Day (UTC)" },
              { label: "Upvotes", numeric: true },
              { label: "Downvotes", numeric: true },
              { label: "Net", numeric: true },
            ]}
            rows={[...activeDays].reverse().map((d) => ({
              key: d.date,
              cells: [longDate(d.date), d.up, d.down, signed(d.up - d.down)],
            }))}
            footnote={quietDays > 0 ? `The other ${plural(quietDays, "day")} had no votes.` : undefined}
          />
        )
      }
    />
  );
}

function HeatmapCard({ s }: { s: DashboardStats }) {
  const h = s.heatmap;
  const empty = h.max === 0;
  const insight = h.busiest
    ? `Busiest hour: ${WEEKDAYS_LONG[h.busiest.day]} at ${hourLabel(h.busiest.hour)} (${plural(h.busiest.count, "vote")}).` +
      (h.busiestDay ? ` Busiest day: ${WEEKDAYS_LONG[h.busiestDay.day]}.` : "")
    : "";

  return (
    <ChartCard
      title="When people vote"
      subtitle={empty ? "Every vote, placed by weekday and hour (UTC)." : `${insight} Times in UTC.`}
      chart={
        empty ? (
          <EmptyState icon="🕒" title="No votes to place yet">
            This heatmap lights up at the hours people vote.
          </EmptyState>
        ) : (
          <VoteHeatmap
            counts={h.counts}
            max={h.max}
            start={h.busiest ? { day: h.busiest.day, hour: h.busiest.hour } : null}
          />
        )
      }
      table={
        empty ? null : (
          <DataTable
            caption="Votes by weekday (rows) and hour of day in UTC (columns)"
            columns={[
              { label: "Day" },
              ...Array.from({ length: 24 }, (_, hour) => ({ label: hourTick(hour), numeric: true })),
              { label: "Total", numeric: true },
            ]}
            rows={h.counts.map((row, day) => ({
              key: WEEKDAYS[day],
              cells: [
                WEEKDAYS[day],
                ...row.map((c, hour) => (
                  <span key={hour} className={c ? "font-semibold" : "text-muted"}>
                    {c}
                  </span>
                )),
                <span key="total" className="font-semibold">
                  {row.reduce((a, b) => a + b, 0)}
                </span>,
              ],
            }))}
          />
        )
      }
    />
  );
}

function VerdictCard({ s }: { s: DashboardStats }) {
  const v = s.verdicts;
  const votedJokes = v.loved + v.even + v.disliked;
  // Diverging order: negative, neutral, positive. "Even" is a real category,
  // so it gets a visible neutral gray rather than the near-surface midpoint.
  const segments = [
    { key: "disliked", label: "Disliked", count: v.disliked, color: COLORS.down },
    { key: "even", label: "Split even", count: v.even, color: COLORS.muted },
    { key: "loved", label: "Loved", count: v.loved, color: COLORS.up },
  ];

  return (
    <ChartCard
      title="Joke verdicts"
      subtitle={
        votedJokes
          ? `${percent(v.loved / votedJokes)} of voted jokes have a positive score.`
          : "Each joke's overall verdict, once it has votes."
      }
      chart={
        votedJokes ? (
          <div>
            <StackedBar segments={segments} unit={["joke", "jokes"]} />
            <p className="mt-4 text-sm text-muted">
              {v.unvoted
                ? `${plural(v.unvoted, "more joke")} ${v.unvoted === 1 ? "is" : "are"} still waiting for a first vote.`
                : "Every joke has at least one vote."}
            </p>
          </div>
        ) : (
          <EmptyState icon="⚖️" title="No verdicts yet">
            {s.totals.jokes
              ? `${plural(s.totals.jokes, "joke")} ${s.totals.jokes === 1 ? "is" : "are"} waiting for votes.`
              : "Jokes appear once someone uploads a photo."}
          </EmptyState>
        )
      }
      table={
        votedJokes ? (
          <DataTable
            caption="Jokes by overall verdict"
            columns={[{ label: "Verdict" }, { label: "Jokes", numeric: true }, { label: "Share", numeric: true }]}
            rows={[
              ...segments.map((seg) => ({
                key: seg.key,
                cells: [seg.label, seg.count, percent(seg.count / votedJokes)],
              })),
              { key: "unvoted", cells: ["No votes yet", v.unvoted, "—"] },
            ]}
            footnote="Share is out of jokes with at least one vote."
          />
        ) : null
      }
    />
  );
}

function LengthCard({ s }: { s: DashboardStats }) {
  const ranked = s.lengths
    .filter((b) => b.avgScore !== null)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
  const anyVoted = ranked.length > 0;
  const topScore = ranked[0]?.avgScore ?? null;
  const leaders = ranked.filter((b) => b.avgScore === topScore);
  const insight =
    ranked.length < 2
      ? "Average score of voted jokes, by length."
      : leaders.length === ranked.length
        ? `No clear winner yet: every length averages ${signedDecimal(topScore)}.`
        : `${leaders.map((b) => b.label).join(" and ")} jokes score best so far (${signedDecimal(topScore)} on average).`;
  const data: BarDatum[] = s.lengths.map((b) => ({
    key: b.key,
    label: b.label,
    sublabel: plural(b.jokes, "joke"),
    value: b.avgScore,
    valueLabel: b.avgScore !== null ? signedDecimal(b.avgScore) : b.jokes ? "No votes yet" : "No jokes",
    tooltipTitle: `${b.label}: ${b.range.toLowerCase()}`,
    tooltipRows: [
      { value: signedDecimal(b.avgScore), label: "average score" },
      { value: `${b.votedJokes} of ${b.jokes}`, label: "jokes voted on" },
      { value: `${b.votes}`, label: b.votes === 1 ? "vote" : "votes" },
    ],
  }));

  return (
    <ChartCard
      title="Does length matter?"
      subtitle={insight}
      legend={
        anyVoted ? (
          <Legend
            items={[
              ...(ranked.some((b) => (b.avgScore ?? 0) >= 0) ? [{ label: "Net positive", color: COLORS.up }] : []),
              ...(ranked.some((b) => (b.avgScore ?? 0) < 0) ? [{ label: "Net negative", color: COLORS.down }] : []),
            ]}
          />
        ) : null
      }
      chart={
        anyVoted ? (
          <div>
            <BarList data={data} tone="diverging" ariaLabel="Average joke score by joke length." />
            <p className="mt-3 text-xs text-muted">
              {s.lengths.map((b) => `${b.label}: ${b.range.toLowerCase()}`).join(" · ")}
            </p>
          </div>
        ) : (
          <EmptyState icon="📏" title="Not enough votes yet">
            Once jokes get votes, this compares short, medium and long ones.
          </EmptyState>
        )
      }
      table={
        anyVoted ? (
          <DataTable
            caption="Joke score by length"
            columns={[
              { label: "Length" },
              { label: "Jokes", numeric: true },
              { label: "Voted on", numeric: true },
              { label: "Votes", numeric: true },
              { label: "Avg score", numeric: true },
            ]}
            rows={s.lengths.map((b) => ({
              key: b.key,
              cells: [
                <span key="label">
                  <span className="font-medium">{b.label}</span>
                  <span className="block text-xs text-muted">{b.range}</span>
                </span>,
                b.jokes,
                b.votedJokes,
                b.votes,
                signedDecimal(b.avgScore),
              ],
            }))}
          />
        ) : null
      }
    />
  );
}

function ModelCard({ s }: { s: DashboardStats }) {
  const models = s.models;
  const leader =
    models.length > 1
      ? [...models].filter((m) => m.avgScore !== null).sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))[0]
      : undefined;

  let chart: ReactNode;
  if (models.length === 0) {
    chart = (
      <EmptyState icon="🤖" title="No AI jokes yet">
        Gemini writes jokes as soon as someone uploads a photo.
      </EmptyState>
    );
  } else if (models.length === 1) {
    // One model: a one-bar chart would say less than the numbers do.
    const m = models[0];
    chart = (
      <div>
        <p className="text-sm text-muted">Every joke so far was written by</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{m.label}</p>
        <dl className="mt-5 grid grid-cols-3 gap-3">
          <Figure label="Jokes" value={bigNumber(m.jokes)} />
          <Figure label="Avg score" value={signedDecimal(m.avgScore)} />
          <Figure label="👍 share" value={percent(m.upShare)} />
        </dl>
        <p className="mt-4 text-xs text-muted">A comparison chart appears once a second model writes jokes.</p>
      </div>
    );
  } else {
    const data: BarDatum[] = models.map((m) => ({
      key: m.key,
      label: m.label,
      sublabel: `avg score ${signedDecimal(m.avgScore)}`,
      value: m.jokes,
      valueLabel: bigNumber(m.jokes),
      tooltipTitle: m.label,
      tooltipRows: [
        { value: bigNumber(m.jokes), label: m.jokes === 1 ? "joke" : "jokes", color: COLORS.series1 },
        { value: signedDecimal(m.avgScore), label: "average score" },
        { value: percent(m.upShare), label: "upvote share" },
      ],
    }));
    chart = <BarList data={data} tone="series" ariaLabel="Number of jokes written by each AI model." />;
  }

  return (
    <ChartCard
      title="AI models"
      subtitle={
        models.length > 1
          ? `Jokes written per model.${leader ? ` ${leader.label} scores best (${signedDecimal(leader.avgScore)}).` : ""}`
          : "Which Gemini model wrote the jokes, and how they score."
      }
      chart={chart}
      table={
        models.length > 1 ? (
          <DataTable
            caption="Jokes and scores by AI model"
            columns={[
              { label: "Model" },
              { label: "Jokes", numeric: true },
              { label: "Votes", numeric: true },
              { label: "Avg score", numeric: true },
              { label: "👍 share", numeric: true },
            ]}
            rows={models.map((m) => ({
              key: m.key,
              cells: [m.label, m.jokes, m.votes, signedDecimal(m.avgScore), percent(m.upShare)],
            }))}
          />
        ) : null
      }
    />
  );
}
