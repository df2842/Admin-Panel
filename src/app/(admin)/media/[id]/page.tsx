import Link from "next/link";
import { notFound } from "next/navigation";
import CaptionItem, { type CaptionView } from "@/components/media/CaptionItem";
import DescriptionEditor from "@/components/media/DescriptionEditor";
import { AddCaptionForm, DeleteImageButton, GenerateCaptions } from "@/components/media/JokeTools";
import { Banner, ErrorCard } from "@/components/media/Notice";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime, signed } from "@/lib/format";
import {
  APP_URL,
  MAX_JOKES_PER_PHOTO,
  isUuid,
  loadMedia,
  modelLabel,
  personLabel,
  type MediaDetail,
} from "@/lib/media";

export const dynamic = "force-dynamic";
/** "Generate more with AI" runs as a server action on this page. */
export const maxDuration = 60;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MediaDetailPage({ params, searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();

  let detail: MediaDetail | null = null;
  let loadError: string | null = null;
  try {
    detail = await loadMedia(supabase, id);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unknown error.";
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/media" className="btn btn-secondary">
          ← All media
        </Link>
        <ErrorCard title="Couldn't load this photo" message={loadError} />
      </div>
    );
  }
  if (!detail) notFound();

  const { image, captions, topCaptionId, people } = detail;
  const uploader = people.get(image.user_id);
  const votes = captions.reduce((n, c) => n + c.upvotes + c.downvotes, 0);
  const score = captions.reduce((n, c) => n + c.score, 0);
  const aiEnabled = !!process.env.GEMINI_API_KEY;
  const justCreated = sp.created === "1";

  const views: CaptionView[] = captions.map((c) => ({
    id: c.id,
    text: c.text,
    model: modelLabel(c.model),
    author: personLabel(people.get(c.user_id), c.user_id),
    created: formatDateTime(c.created_at),
    upvotes: c.upvotes,
    downvotes: c.downvotes,
    score: c.score,
    isTop: c.id === topCaptionId,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/media" className="btn btn-secondary">
        ← All media
      </Link>

      {justCreated && (
        <Banner tone="success" dismissHref={`/media/${image.id}`}>
          ✓ Photo created{captions.length ? ` with ${captions.length} joke${captions.length === 1 ? "" : "s"}` : ""}.
        </Banner>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">Photo details</h1>
          <p className="mt-1 text-sm text-muted">
            {captions.length} joke{captions.length === 1 ? "" : "s"} · {votes} vote{votes === 1 ? "" : "s"} · net score{" "}
            <span className="font-semibold text-foreground">{signed(score)}</span>
          </p>
        </div>
        <DeleteImageButton imageId={image.id} jokeCount={captions.length} voteCount={votes} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Left: the photo, facts and description */}
        <section className="space-y-4" aria-label="Photo">
          <div className="card overflow-hidden">
            <a href={image.public_url} target="_blank" rel="noreferrer" title="Open full size">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.public_url}
                alt={image.description.slice(0, 200)}
                className="max-h-[70vh] w-full bg-border/40 object-contain"
              />
            </a>
          </div>

          <dl className="card grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 text-sm sm:p-5">
            <dt className="text-muted">Uploader</dt>
            <dd className="min-w-0">
              <span className="font-semibold">{personLabel(uploader, image.user_id)}</span>
              {uploader?.email && uploader.full_name && (
                <span className="block truncate text-xs text-muted">{uploader.email}</span>
              )}
            </dd>
            <dt className="text-muted">Created</dt>
            <dd>{formatDateTime(image.created_at)}</dd>
            <dt className="text-muted">Photo ID</dt>
            <dd className="break-all font-mono text-xs">{image.id}</dd>
            <dt className="text-muted">File</dt>
            <dd className="min-w-0">
              <a
                href={image.public_url}
                target="_blank"
                rel="noreferrer"
                className="break-all font-mono text-xs text-primary hover:underline"
              >
                {image.storage_path} ↗
              </a>
            </dd>
            <dt className="text-muted">Public page</dt>
            <dd>
              <a
                href={`${APP_URL}/gallery/${image.id}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary hover:underline"
              >
                Open in Caption Arena ↗
              </a>
            </dd>
          </dl>

          <DescriptionEditor imageId={image.id} initial={image.description} />
        </section>

        {/* Right: jokes */}
        <section className="space-y-4" aria-label="Jokes">
          <div className="card p-4 sm:p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold">Jokes</h2>
              <span className="text-sm tabular-nums text-muted">
                {captions.length}/{MAX_JOKES_PER_PHOTO}
              </span>
            </div>
            {views.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
                <p className="text-3xl" aria-hidden>
                  🦗
                </p>
                <p className="mt-2 font-semibold">No jokes yet</p>
                <p className="mt-1 text-sm text-muted">Add one below or let the AI write a few.</p>
              </div>
            ) : (
              <ol className="space-y-3">
                {views.map((c, i) => (
                  <CaptionItem key={c.id} caption={c} index={i} />
                ))}
              </ol>
            )}
          </div>

          <div className="card p-4 sm:p-5">
            <AddCaptionForm imageId={image.id} jokeCount={captions.length} />
          </div>

          <div className="card p-4 sm:p-5">
            <GenerateCaptions imageId={image.id} jokeCount={captions.length} aiEnabled={aiEnabled} />
          </div>
        </section>
      </div>
    </div>
  );
}
