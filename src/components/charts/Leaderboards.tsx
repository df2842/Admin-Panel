import { formatDate, signed } from "@/lib/format";
import { prettyModel } from "@/lib/joke-styles";
import type { JokeStat, PhotoStat } from "@/lib/stats";
import Avatar from "./Avatar";
import DataTable from "./DataTable";
import EmptyState from "./EmptyState";
import { COLORS, percent, plural, signedDecimal } from "./chart-utils";

const isWebUrl = (url: string | null | undefined): url is string => !!url && /^https?:\/\//i.test(url);

function Thumb({ url, alt, className }: { url: string | null; alt: string; className: string }) {
  if (!isWebUrl(url)) {
    return (
      <span aria-hidden className={`grid place-items-center bg-border text-muted ${className}`}>
        🖼️
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt.slice(0, 140)} loading="lazy" className={`bg-border object-cover ${className}`} />
  );
}

/** Tiny up/down split beside the counts (direct-labelled, so no tooltip needed). */
function MiniSplit({ up, down }: { up: number; down: number }) {
  const parts = [
    { key: "up", count: up, color: COLORS.up },
    { key: "down", count: down, color: COLORS.down },
  ].filter((p) => p.count > 0);
  return (
    <span aria-hidden className="inline-flex h-1.5 w-12 shrink-0 gap-[2px]">
      {parts.map((p, i) => (
        <span
          key={p.key}
          className={`h-full ${i === 0 ? "rounded-l-[4px]" : ""} ${i === parts.length - 1 ? "rounded-r-[4px]" : ""}`}
          style={{ flexGrow: p.count, flexBasis: 0, background: p.color }}
        />
      ))}
    </span>
  );
}

function JokeCell({ joke }: { joke: JokeStat }) {
  return (
    <div className="flex min-w-44 items-start gap-3">
      <Thumb url={joke.imageUrl} alt={joke.imageDescription ?? ""} className="h-12 w-12 shrink-0 rounded-lg" />
      <div className="min-w-0">
        <p className="line-clamp-3 font-medium leading-snug">“{joke.text}”</p>
        <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">
          <MiniSplit up={joke.upvotes} down={joke.downvotes} />
          <span className="whitespace-nowrap">
            {joke.upvotes} up · {joke.downvotes} down
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted">{prettyModel(joke.model)}</p>
      </div>
    </div>
  );
}

export function FunniestJokes({ jokes, anyVotes }: { jokes: JokeStat[]; anyVotes: boolean }) {
  if (!jokes.length) {
    return (
      <EmptyState icon="🏆" title="No winners yet">
        {anyVotes
          ? "No joke has a positive score yet. Tough crowd."
          : "The leaderboard fills in once people start voting."}
      </EmptyState>
    );
  }
  return (
    <DataTable
      caption="Funniest jokes by net score"
      columns={[{ label: "#", numeric: true }, { label: "Joke" }, { label: "Score", numeric: true }]}
      rows={jokes.map((j, i) => ({
        key: j.id,
        cells: [
          <span key="rank" className="font-semibold text-muted">
            {i + 1}
          </span>,
          <JokeCell key="joke" joke={j} />,
          <span key="score" className="text-base font-semibold">
            {signed(j.score)}
          </span>,
        ],
      }))}
    />
  );
}

export function ControversialJokes({ jokes, anyVotes }: { jokes: JokeStat[]; anyVotes: boolean }) {
  if (!jokes.length) {
    return (
      <EmptyState icon="⚖️" title="No split decisions yet">
        {anyVotes
          ? "Controversy needs a joke with at least one 👍 and one 👎. Everyone agrees so far."
          : "Once people vote, jokes that split the room show up here."}
      </EmptyState>
    );
  }
  return (
    <DataTable
      caption="Most controversial jokes: both upvotes and downvotes"
      columns={[{ label: "#", numeric: true }, { label: "Joke" }, { label: "Score", numeric: true }]}
      rows={jokes.map((j, i) => ({
        key: j.id,
        cells: [
          <span key="rank" className="font-semibold text-muted">
            {i + 1}
          </span>,
          <JokeCell key="joke" joke={j} />,
          <span key="score" className="text-base font-semibold">
            {signed(j.score)}
          </span>,
        ],
      }))}
    />
  );
}

export function BestPhotos({ photos, anyPhotos }: { photos: PhotoStat[]; anyPhotos: boolean }) {
  if (!photos.length) {
    return (
      <EmptyState icon="📸" title={anyPhotos ? "No photo has votes yet" : "No photos yet"}>
        {anyPhotos
          ? "Photos are ranked by how well their jokes score, so they need a few votes first."
          : "Uploaded photos will be ranked here by how well their jokes land."}
      </EmptyState>
    );
  }
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((p, i) => (
        <li key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-background/50">
          <div className="relative">
            <Thumb url={p.url} alt={p.description} className="aspect-[4/3] w-full" />
            <span className="badge absolute left-3 top-3 bg-card/95 text-sm text-foreground shadow">#{i + 1}</span>
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div>
              <p className="text-3xl font-semibold tracking-tight">{signedDecimal(p.avgScore)}</p>
              <p className="text-xs text-muted">average score per voted joke</p>
            </div>
            <p className="text-sm text-muted">
              {plural(p.jokes, "joke")} · {plural(p.votes, "vote")} · {percent(p.votes ? p.upvotes / p.votes : null)} 👍
            </p>
            {p.bestJoke ? (
              <blockquote className="border-l-2 border-primary pl-3 text-sm leading-snug">
                <p className="line-clamp-3">“{p.bestJoke.text}”</p>
                <footer className="mt-1 text-xs text-muted">Best joke · {signed(p.bestJoke.score)}</footer>
              </blockquote>
            ) : null}
            <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted">
              <Avatar person={p.uploader} size={24} />
              <span className="min-w-0 truncate">
                {p.uploader.name} · {formatDate(p.createdAt)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
