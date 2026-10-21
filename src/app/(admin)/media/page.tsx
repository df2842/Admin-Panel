import Link from "next/link";
import { Banner, ErrorCard } from "@/components/media/Notice";
import { requireAdmin } from "@/lib/admin";
import { formatDate, signed } from "@/lib/format";
import {
  PAGE_SIZE,
  SEARCH_MAX,
  SORTS,
  isUuid,
  loadMediaList,
  parseSort,
  personLabel,
  type MediaList,
  type MediaListItem,
  type MediaSort,
} from "@/lib/media";

export const metadata = { title: "Media" };

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Query = { q: string; sort: MediaSort; page: number; user: string | null };

/** Builds a /media URL, dropping defaults so links stay short. */
function mediaHref(query: Query, patch: Partial<Query> = {}): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.user) params.set("user", next.user);
  if (next.page > 1) params.set("page", String(next.page));
  const s = params.toString();
  return s ? `/media?${s}` : "/media";
}

function scoreTone(score: number) {
  if (score > 0) return "bg-(--score-pos-bg) text-(--score-pos-fg)";
  if (score < 0) return "bg-(--score-neg-bg) text-(--score-neg-fg)";
  return "bg-black/60 text-white";
}

export default async function MediaPage({ searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;

  const pageNumber = Number.parseInt(first(sp.page) ?? "1", 10);
  const userParam = first(sp.user);
  const query: Query = {
    q: (first(sp.q) ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX),
    sort: parseSort(first(sp.sort)),
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? Math.min(pageNumber, 10_000) : 1,
    user: isUuid(userParam) ? userParam : null,
  };
  const deleted = first(sp.deleted);

  let list: MediaList | null = null;
  let loadError: string | null = null;
  try {
    list = await loadMediaList(supabase, { q: query.q, sort: query.sort, page: query.page, userId: query.user });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unknown error.";
  }
  const current: Query = list ? { ...query, page: list.page } : query;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Media</h1>
          <p className="mt-1 text-sm text-muted">
            {list
              ? `${list.totals.photos} photo${list.totals.photos === 1 ? "" : "s"} · ${list.totals.jokes} joke${
                  list.totals.jokes === 1 ? "" : "s"
                } · ${list.totals.votes} vote${list.totals.votes === 1 ? "" : "s"}`
              : "Photos and their AI-written jokes"}
          </p>
        </div>
        <Link href="/media/new" className="btn btn-primary btn-lg w-full sm:w-auto">
          + New media
        </Link>
      </header>

      {deleted === "1" && (
        <Banner tone="success" dismissHref={mediaHref(query)}>
          ✓ Photo deleted, along with its jokes and votes.
        </Banner>
      )}
      {deleted === "file" && (
        <Banner tone="warning" dismissHref={mediaHref(query)}>
          Photo deleted, but its file could not be removed from storage. It is no longer shown anywhere.
        </Banner>
      )}

      {loadError || !list ? (
        <ErrorCard title="Couldn't load media" message={loadError ?? "Unknown error."} />
      ) : list.totals.photos === 0 ? (
        <EmptyLibrary />
      ) : (
        <>
          <Toolbar
            query={current}
            uploader={query.user ? personLabel(list.people.get(query.user), query.user) : null}
          />

          {list.total === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-4xl" aria-hidden>
                🔍
              </p>
              <p className="mt-3 text-lg font-semibold">No photos match</p>
              <p className="mt-1 text-sm text-muted">
                {query.q ? (
                  <>Nothing has &ldquo;{query.q}&rdquo; in its description or jokes.</>
                ) : (
                  "Try another filter."
                )}
              </p>
              <Link href="/media" className="btn btn-secondary btn-lg mt-5">
                Show all photos
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted" aria-live="polite">
                Showing {(list.page - 1) * PAGE_SIZE + 1}–{Math.min(list.page * PAGE_SIZE, list.total)} of {list.total}
                {query.q && <> matching &ldquo;{query.q}&rdquo;</>}
              </p>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {list.items.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    uploader={personLabel(list.people.get(item.user_id), item.user_id)}
                  />
                ))}
              </ul>
              <Pagination query={current} pages={list.pages} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Toolbar({ query, uploader }: { query: Query; uploader: string | null }) {
  return (
    <div className="card space-y-4 p-4">
      <form action="/media" method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="media-search" className="sr-only">
          Search descriptions and jokes
        </label>
        <input
          id="media-search"
          type="search"
          name="q"
          defaultValue={query.q}
          maxLength={SEARCH_MAX}
          placeholder="Search descriptions and jokes…"
          className="input h-12 flex-1 text-base"
        />
        {query.sort !== "newest" && <input type="hidden" name="sort" value={query.sort} />}
        {query.user && <input type="hidden" name="user" value={query.user} />}
        <button type="submit" className="btn btn-primary btn-lg">
          Search
        </button>
        {query.q && (
          <Link href={mediaHref(query, { q: "", page: 1 })} className="btn btn-secondary btn-lg">
            Clear
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-muted">Sort</span>
        {(Object.keys(SORTS) as MediaSort[]).map((key) => {
          const active = key === query.sort;
          return (
            <Link
              key={key}
              href={mediaHref(query, { sort: key, page: 1 })}
              aria-current={active ? "true" : undefined}
              className={`btn ${active ? "btn-primary" : "btn-secondary"}`}
            >
              {SORTS[key]}
            </Link>
          );
        })}
        {uploader && (
          <Link
            href={mediaHref(query, { user: null, page: 1 })}
            className="btn btn-secondary sm:ml-auto"
            title="Remove uploader filter"
          >
            Uploaded by {uploader} ✕
          </Link>
        )}
      </div>
    </div>
  );
}

function MediaCard({ item, uploader }: { item: MediaListItem; uploader: string }) {
  return (
    <li>
      <Link
        href={`/media/${item.id}`}
        className="card group flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
      >
        <div className="relative aspect-[4/3] bg-border/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.public_url}
            alt={item.description.slice(0, 160)}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <span
            className={`badge absolute right-2 top-2 px-2.5 py-1 text-xs shadow ${scoreTone(item.score)}`}
            title="Net score"
          >
            {signed(item.score)}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          {item.topJoke ? (
            <p className="line-clamp-3 font-semibold leading-snug">
              <span className="sr-only">Top joke: </span>&ldquo;{item.topJoke.text}&rdquo;
            </p>
          ) : (
            <p className="italic text-muted">No jokes yet</p>
          )}
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Jokes" value={String(item.jokes)} />
            <Stat label="Votes" value={String(item.votes)} />
            <Stat label="Score" value={signed(item.score)} />
          </dl>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted">
            <span className="truncate" title={uploader}>
              👤 {uploader}
            </span>
            <span className="shrink-0">{formatDate(item.created_at)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background px-2 py-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-base font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function Pagination({ query, pages }: { query: Query; pages: number }) {
  if (pages <= 1) return null;
  const prev = query.page > 1 ? mediaHref(query, { page: query.page - 1 }) : null;
  const next = query.page < pages ? mediaHref(query, { page: query.page + 1 }) : null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-2">
      {prev ? (
        <Link href={prev} className="btn btn-secondary btn-lg">
          ← Previous
        </Link>
      ) : (
        <span className="btn btn-secondary btn-lg pointer-events-none opacity-40" aria-hidden>
          ← Previous
        </span>
      )}
      <span className="text-sm font-semibold text-muted">
        Page {query.page} of {pages}
      </span>
      {next ? (
        <Link href={next} className="btn btn-secondary btn-lg">
          Next →
        </Link>
      ) : (
        <span className="btn btn-secondary btn-lg pointer-events-none opacity-40" aria-hidden>
          Next →
        </span>
      )}
    </nav>
  );
}

function EmptyLibrary() {
  return (
    <div className="card mx-auto max-w-xl p-10 text-center">
      <p className="text-5xl" aria-hidden>
        🖼️
      </p>
      <h2 className="mt-4 text-xl font-bold">No photos yet</h2>
      <p className="mt-2 text-sm text-muted">
        Photos uploaded in Caption Arena show up here. You can also add one yourself and let the AI write the jokes.
      </p>
      <Link href="/media/new" className="btn btn-primary btn-lg mt-6">
        + Upload the first photo
      </Link>
    </div>
  );
}
