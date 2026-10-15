import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AdminBadge,
  Avatar,
  EmptyState,
  ErrorCard,
  SetupNotice,
  SplitBar,
  StatTile,
  TableCard,
  TD,
  TH,
  Thumb,
  VoteBadge,
} from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import { compactNumber, displayName, formatDate, formatDateTime, signed, timeAgo, trustedImageUrl } from "@/lib/format";
import {
  errorMessage,
  hrefWith,
  loadPerson,
  RECENT_VOTES,
  shortId,
  UUID,
  votesCast,
  type PersonDetail,
} from "@/lib/people";

export const dynamic = "force-dynamic";
export const metadata = { title: "User" };

/** Photos shown on the profile; the rest are counted, not rendered. */
const PHOTO_LIMIT = 48;

/** Request time, read once per render so every "x ago" agrees. */
function requestTime(): number {
  return Date.now();
}

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id: rawId } = await params;
  if (typeof rawId !== "string" || !UUID.test(rawId)) notFound();
  const id = rawId.toLowerCase();

  let detail: PersonDetail | null = null;
  let error: string | null = null;
  try {
    detail = await loadPerson(supabase, id);
  } catch (err) {
    error = errorMessage(err);
  }
  if (!error && !detail) notFound();
  const now = requestTime();

  const back = (
    <Link href="/users" className="btn btn-ghost -ml-3 mb-4">
      ← All users
    </Link>
  );

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-6xl">
        {back}
        <ErrorCard message={error ?? "Unknown error."} />
      </div>
    );
  }

  const { profile, profilesMissing, photos, stats, recentVotes } = detail;
  const name = profile ? displayName(profile) : `User ${shortId(id)}`;
  const cast = votesCast(stats);
  const allVotesHref = hrefWith("/votes", { voter: id });

  return (
    <div className="mx-auto max-w-6xl">
      {back}
      {profilesMissing && <SetupNotice />}

      {/* Profile header */}
      <section className="card mb-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <Avatar src={profile?.avatar_url} name={profile ? name : "?"} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="min-w-0 break-words">{name}</span>
            {profile?.is_superadmin && <AdminBadge />}
          </h1>
          {profile?.email && <p className="mt-1 break-all text-sm text-muted">{profile.email}</p>}
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-1.5">
              <dt className="text-muted">Joined</dt>
              <dd className="font-medium">{formatDate(profile?.created_at ?? null)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted">Last sign-in</dt>
              <dd className="font-medium">
                {profile?.last_sign_in_at ? (
                  <time dateTime={profile.last_sign_in_at} title={formatDateTime(profile.last_sign_in_at)}>
                    {timeAgo(profile.last_sign_in_at, now)}
                  </time>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex min-w-0 gap-1.5">
              <dt className="text-muted">ID</dt>
              <dd className="truncate font-mono text-xs leading-5" title={id}>
                {id}
              </dd>
            </div>
          </dl>
        </div>
        {cast > 0 && (
          <Link href={allVotesHref} className="btn btn-secondary btn-lg shrink-0">
            🗳️ All their votes
          </Link>
        )}
      </section>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Photos uploaded" value={compactNumber(stats.photos)} />
        <StatTile label="Jokes on their photos" value={compactNumber(stats.jokes)} />
        <StatTile
          label="Score their jokes received"
          value={signed(stats.score)}
          sub={`👍 ${stats.upReceived} · 👎 ${stats.downReceived}`}
        >
          <SplitBar up={stats.upReceived} down={stats.downReceived} />
        </StatTile>
        <StatTile label="Votes cast" value={compactNumber(cast)} sub={`👍 ${stats.upGiven} · 👎 ${stats.downGiven}`}>
          <SplitBar up={stats.upGiven} down={stats.downGiven} />
        </StatTile>
      </div>

      {/* Photos */}
      <section className="mb-8" aria-labelledby="photos-heading">
        <h2 id="photos-heading" className="mb-3 text-lg font-bold">
          Photos <span className="font-normal text-muted">({photos.length})</span>
        </h2>
        {photos.length === 0 ? (
          <EmptyState icon="🖼️" title="No photos uploaded yet" />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
              {photos.slice(0, PHOTO_LIMIT).map((photo) => (
                <li key={photo.id}>
                  <Link
                    href={`/media/${photo.id}`}
                    className="group card block overflow-hidden transition hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <div className="aspect-square bg-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={trustedImageUrl(photo.public_url)}
                        alt={photo.description ? photo.description.slice(0, 120) : "Uploaded photo"}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                      <span className="text-muted">{formatDate(photo.created_at)}</span>
                      <span className="whitespace-nowrap font-semibold" title="Jokes · net score">
                        {photo.jokes} {photo.jokes === 1 ? "joke" : "jokes"} · {signed(photo.score)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {photos.length > PHOTO_LIMIT && (
              <p className="mt-3 text-sm text-muted">
                Showing the newest {PHOTO_LIMIT} of {photos.length} photos.
              </p>
            )}
          </>
        )}
      </section>

      {/* Recent votes */}
      <section aria-labelledby="votes-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="votes-heading" className="text-lg font-bold">
            Recent votes <span className="font-normal text-muted">({compactNumber(cast)})</span>
          </h2>
          {cast > recentVotes.length && (
            <Link href={allVotesHref} className="text-sm font-semibold text-primary hover:underline">
              See all {compactNumber(cast)} →
            </Link>
          )}
        </div>
        {recentVotes.length === 0 ? (
          <EmptyState icon="🗳️" title="Hasn't voted yet" />
        ) : (
          <>
            <TableCard minWidth={620} caption={`Latest ${RECENT_VOTES} votes by ${name}`}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    When
                  </th>
                  <th scope="col" className={TH}>
                    Vote
                  </th>
                  <th scope="col" className={TH}>
                    Joke
                  </th>
                  <th scope="col" className={TH}>
                    Photo
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentVotes.map((v) => (
                  <tr key={v.id} className="transition hover:bg-background/70">
                    <td className={`${TD} whitespace-nowrap`}>
                      <time dateTime={v.created_at} title={formatDateTime(v.created_at)}>
                        {timeAgo(v.created_at, now)}
                      </time>
                    </td>
                    <td className={TD}>
                      <VoteBadge value={v.value} />
                    </td>
                    <td className={`${TD} max-w-xl`}>
                      {v.caption ? (
                        <p className="line-clamp-2">{v.caption.text}</p>
                      ) : (
                        <span className="text-muted">Joke unavailable</span>
                      )}
                    </td>
                    <td className={`${TD} w-20`}>
                      {v.caption ? (
                        <Thumb href={`/media/${v.caption.image_id}`} src={v.caption.image_url} alt="Photo for this joke" size={48} />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
            {cast > recentVotes.length && (
              <p className="mt-3 text-sm text-muted">
                Showing the latest {recentVotes.length}.{" "}
                <Link href={allVotesHref} className="font-semibold text-primary hover:underline">
                  See every vote →
                </Link>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
