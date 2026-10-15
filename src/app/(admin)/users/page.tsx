import Link from "next/link";
import type { ReactNode } from "react";
import FilterBar from "@/components/tables/FilterBar";
import { Segmented } from "@/components/tables/controls";
import {
  AdminBadge,
  Avatar,
  EmptyState,
  ErrorCard,
  NUM,
  PageHeader,
  SetupNotice,
  StatGrid,
  StatTile,
  TableCard,
  TD,
  TH,
} from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import { compactNumber, displayName, formatDate, formatDateTime, signed, timeAgo } from "@/lib/format";
import {
  activity,
  errorMessage,
  hrefWith,
  loadPeople,
  param,
  pickEnum,
  shortId,
  votesCast,
  type Person,
  type SearchParams,
} from "@/lib/people";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

const SORTS = ["newest", "active", "score"] as const;
type Sort = (typeof SORTS)[number];
const WEEK_MS = 7 * 86_400_000;

/** Request time, read once per render so every "x ago" agrees. */
function requestTime(): number {
  return Date.now();
}

function time(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0;
}

function nameOf(p: Person): string {
  return p.profile ? displayName(p.profile) : `User ${shortId(p.id)}`;
}

function sortPeople(people: Person[], sort: Sort): Person[] {
  const byName = (a: Person, b: Person) => nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base" });
  const sorted = [...people];
  if (sort === "active") {
    sorted.sort(
      (a, b) =>
        activity(b.stats) - activity(a.stats) ||
        time(b.stats.lastActiveAt) - time(a.stats.lastActiveAt) ||
        byName(a, b),
    );
  } else if (sort === "score") {
    sorted.sort((a, b) => b.stats.score - a.stats.score || b.stats.upReceived - a.stats.upReceived || byName(a, b));
  } else {
    sorted.sort((a, b) => time(b.stats.firstSeenAt) - time(a.stats.firstSeenAt) || byName(a, b));
  }
  return sorted;
}

function matches(p: Person, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [p.profile?.full_name, p.profile?.email, p.id].some((v) => v?.toLowerCase().includes(needle));
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const q = param(sp, "q", 100);
  const sort = pickEnum(param(sp, "sort", 10), SORTS, "newest");
  const sortParam = sort === "newest" ? "" : sort;

  let people: Person[] = [];
  let profilesMissing = false;
  let error: string | null = null;
  try {
    ({ people, profilesMissing } = await loadPeople(supabase));
  } catch (err) {
    error = errorMessage(err);
  }
  const now = requestTime();

  const superadmins = people.filter((p) => p.profile?.is_superadmin).length;
  const activeWeek = people.filter((p) => p.stats.lastActiveAt && now - time(p.stats.lastActiveAt) <= WEEK_MS).length;
  const uploaders = people.filter((p) => p.stats.photos > 0).length;
  const shown = sortPeople(
    people.filter((p) => matches(p, q)),
    sort,
  );

  let results: ReactNode = null;
  if (error) {
    results = null;
  } else if (people.length === 0) {
    results = (
      <EmptyState icon="👥" title="No users yet">
        <p>People show up here after they sign in to Caption Arena.</p>
      </EmptyState>
    );
  } else if (shown.length === 0) {
    results = (
      <div className="mt-5">
        <EmptyState icon="🔍" title={`No users match “${q}”`}>
          <p>Try part of a name or an email address.</p>
          <Link href={hrefWith("/users", { sort: sortParam })} className="btn btn-secondary">
            Clear search
          </Link>
        </EmptyState>
      </div>
    );
  } else {
    results = (
      <>
        <p className="mb-3 mt-5 text-sm text-muted">
          {q
            ? `${shown.length} of ${people.length} users match “${q}”`
            : `${people.length} ${people.length === 1 ? "user" : "users"}`}
        </p>
        <TableCard minWidth={940} caption="Users">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                User
              </th>
              <th scope="col" className={TH}>
                Joined
              </th>
              <th scope="col" className={TH}>
                Last sign-in
              </th>
              <th scope="col" className={`${TH} ${NUM}`}>
                Photos
              </th>
              <th scope="col" className={`${TH} ${NUM}`} title="Jokes written about their photos">
                Jokes
              </th>
              <th scope="col" className={`${TH} ${NUM}`}>
                Votes cast
              </th>
              <th scope="col" className={`${TH} ${NUM}`} title="Net score (👍 minus 👎) the jokes on their photos received">
                Score
              </th>
              <th scope="col" className={TH}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const href = `/users/${p.id}`;
              const name = nameOf(p);
              const s = p.stats;
              const signIn = p.profile?.last_sign_in_at ?? null;
              return (
                <tr key={p.id} className="transition hover:bg-background/70">
                  <td className={TD}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar src={p.profile?.avatar_url} name={p.profile ? name : "?"} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link href={href} className="truncate font-semibold hover:text-primary hover:underline">
                            {name}
                          </Link>
                          {p.profile?.is_superadmin && <AdminBadge />}
                          {!p.profile && !profilesMissing && <span className="badge bg-border text-muted">No profile</span>}
                        </p>
                        {p.profile?.full_name && p.profile.email ? (
                          <p className="truncate text-xs text-muted">{p.profile.email}</p>
                        ) : !p.profile ? (
                          <p className="truncate font-mono text-xs text-muted">{p.id}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{formatDate(s.firstSeenAt)}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {signIn ? (
                      <time dateTime={signIn} title={formatDateTime(signIn)}>
                        {timeAgo(signIn, now)}
                      </time>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className={`${TD} ${NUM}`}>{compactNumber(s.photos)}</td>
                  <td className={`${TD} ${NUM}`}>{compactNumber(s.jokes)}</td>
                  <td className={`${TD} ${NUM} whitespace-nowrap`}>
                    {votesCast(s) === 0 ? (
                      <span className="text-muted">0</span>
                    ) : (
                      <span title={`${s.upGiven} upvotes and ${s.downGiven} downvotes given`}>
                        <span aria-hidden>👍</span> {s.upGiven} <span className="text-muted">·</span>{" "}
                        <span aria-hidden>👎</span> {s.downGiven}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} ${NUM} whitespace-nowrap`}>
                    <span
                      className={`font-semibold ${s.score === 0 ? "text-muted" : ""}`}
                      title={`👍 ${s.upReceived} · 👎 ${s.downReceived} received`}
                    >
                      {signed(s.score)}
                    </span>
                  </td>
                  <td className={`${TD} text-right`}>
                    <Link href={href} className="btn btn-secondary btn-sm">
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Users" description="Everyone who has signed in to Caption Arena. Read-only." />

      {profilesMissing && <SetupNotice />}
      {error && <ErrorCard message={error} />}

      {!error && (
        <StatGrid>
          <StatTile label="Total users" value={compactNumber(people.length)} sub={`${uploaders} uploaded a photo`} />
          <StatTile label="Superadmins" value={compactNumber(superadmins)} sub="Can open this panel" />
          <StatTile label="Active in last 7 days" value={compactNumber(activeWeek)} sub="Signed in, uploaded or voted" />
        </StatGrid>
      )}

      {!error && (
        <FilterBar action="/users" stateKey={`${q}|${sort}`} label="Search and sort users" results={results}>
          <label className="flex min-w-0 flex-1 basis-64 flex-col">
            <span className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Search</span>
            <span className="flex gap-2">
              <input
                type="search"
                name="q"
                defaultValue={q}
                maxLength={100}
                placeholder="Name or email"
                autoComplete="off"
                className="input h-11 min-w-0 flex-1"
              />
              <button type="submit" className="btn btn-primary h-11 px-5">
                Search
              </button>
            </span>
          </label>
          <Segmented
            name="sort"
            label="Sort"
            value={sortParam}
            options={[
              { value: "", label: "Newest" },
              { value: "active", label: "Most active", title: "Photos uploaded + votes cast" },
              { value: "score", label: "Top score", title: "Net score their jokes received" },
            ]}
          />
          {q && (
            <Link href={hrefWith("/users", { sort: sortParam })} className="btn btn-ghost h-11">
              Clear
            </Link>
          )}
        </FilterBar>
      )}
    </div>
  );
}
