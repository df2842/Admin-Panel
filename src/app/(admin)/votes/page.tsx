import Link from "next/link";
import type { ReactNode } from "react";
import FilterBar from "@/components/tables/FilterBar";
import { Segmented, SelectField } from "@/components/tables/controls";
import {
  Avatar,
  EmptyState,
  ErrorCard,
  PageHeader,
  Pagination,
  SetupNotice,
  SplitBar,
  StatGrid,
  StatTile,
  TableCard,
  TD,
  TH,
  Thumb,
  VoteBadge,
} from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import { compactNumber, displayName, formatDateTime, timeAgo } from "@/lib/format";
import {
  errorMessage,
  hrefWith,
  loadVotes,
  parseVoteFilters,
  shortId,
  VOTES_PER_PAGE,
  type SearchParams,
  type VoteRange,
  type VotesPageData,
} from "@/lib/people";

export const dynamic = "force-dynamic";
export const metadata = { title: "Votes" };

const RANGE_LABEL: Record<VoteRange, string> = {
  all: "All time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

/** Request time, read once per render so ranges and "x ago" agree. */
function requestTime(): number {
  return Date.now();
}

export default async function VotesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { supabase } = await requireAdmin();
  const filters = parseVoteFilters(await searchParams);
  const now = requestTime();

  let data: VotesPageData | null = null;
  let error: string | null = null;
  try {
    data = await loadVotes(supabase, filters, now);
  } catch (err) {
    error = errorMessage(err);
  }

  // URL values (defaults are "" so they drop out of the URL).
  const rangeParam = filters.range === "all" ? "" : filters.range;
  const valueParam = filters.value === "all" ? "" : filters.value;
  const filtered = !!(rangeParam || valueParam || filters.voter);
  const hrefFor = (page: number) =>
    hrefWith("/votes", { range: rangeParam, value: valueParam, voter: filters.voter, page: page > 1 ? page : "" });

  let results: ReactNode = null;
  if (data) {
    const { total, upvotes, downvotes, uniqueVoters, rows, page, totalPages, voters, profilesMissing } = data;
    const share = total > 0 ? Math.round((upvotes / total) * 100) : null;
    const first = (page - 1) * VOTES_PER_PAGE + 1;

    results = (
      <div className="mt-6">
        <StatGrid>
          <StatTile label="Total votes" value={compactNumber(total)} sub={RANGE_LABEL[filters.range]} />
          <StatTile
            label="Upvote share"
            value={share === null ? "—" : `${share}%`}
            sub={`👍 ${compactNumber(upvotes)} · 👎 ${compactNumber(downvotes)}`}
          >
            <SplitBar up={upvotes} down={downvotes} />
          </StatTile>
          <StatTile
            label="Unique voters"
            value={compactNumber(uniqueVoters)}
            sub={uniqueVoters === 1 ? "person voted" : "people voted"}
          />
        </StatGrid>

        {total === 0 ? (
          filtered ? (
            <EmptyState icon="🔍" title="No votes match these filters">
              <p>Try a wider date range or a different voter.</p>
              <Link href="/votes" className="btn btn-secondary">
                Show all votes
              </Link>
            </EmptyState>
          ) : (
            <EmptyState icon="🗳️" title="No votes yet">
              <p>Votes appear here when signed-in users rate jokes in Caption Arena.</p>
            </EmptyState>
          )
        ) : (
          <>
            <TableCard minWidth={700} caption="Votes, newest first">
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    When
                  </th>
                  <th scope="col" className={TH}>
                    Voter
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
                {rows.map((v) => {
                  const voter = voters.get(v.user_id) ?? null;
                  const name = voter ? displayName(voter) : `User ${shortId(v.user_id)}`;
                  return (
                    <tr key={v.id} className="transition hover:bg-background/70">
                      <td className={`${TD} whitespace-nowrap`}>
                        <time dateTime={v.created_at} title={formatDateTime(v.created_at)}>
                          {timeAgo(v.created_at, now)}
                        </time>
                        <span className="block text-xs text-muted">{formatDateTime(v.created_at)}</span>
                      </td>
                      <td className={TD}>
                        <Link
                          href={`/users/${v.user_id}`}
                          className="group flex min-w-0 items-center gap-2.5 font-semibold"
                          title={voter?.email ?? v.user_id}
                        >
                          <Avatar src={voter?.avatar_url} name={voter ? name : "?"} size="sm" />
                          <span
                            className={`max-w-[12rem] truncate group-hover:text-primary group-hover:underline ${voter ? "" : "font-mono text-xs"}`}
                          >
                            {name}
                          </span>
                        </Link>
                      </td>
                      <td className={TD}>
                        <VoteBadge value={v.value} />
                      </td>
                      <td className={`${TD} max-w-md`}>
                        {v.caption ? (
                          <p className="line-clamp-2">{v.caption.text}</p>
                        ) : (
                          <span className="text-muted">Joke unavailable</span>
                        )}
                      </td>
                      <td className={`${TD} w-20`}>
                        {v.caption ? (
                          <Thumb
                            href={`/media/${v.caption.image_id}`}
                            src={v.caption.image_url}
                            alt="Photo for this joke"
                            size={48}
                          />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
            <Pagination
              page={page}
              totalPages={totalPages}
              hrefFor={hrefFor}
              summary={
                <>
                  Showing {first}–{first + rows.length - 1} of {total.toLocaleString("en-US")}
                  {profilesMissing ? " · voters shown by user id" : ""}
                </>
              }
            />
          </>
        )}
      </div>
    );
  }

  const voterOptions = [
    { value: "", label: "Everyone" },
    ...(data?.voterOptions ?? []).map((o) => ({
      value: o.id,
      label: o.profile ? displayName(o.profile) : `User ${shortId(o.id)}`,
    })),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Votes" description="Every 👍 and 👎 cast in Caption Arena, newest first. Read-only." />

      {data?.profilesMissing && <SetupNotice />}
      {error && <ErrorCard message={error} />}

      {!error && (
        <FilterBar
          action="/votes"
          stateKey={`${rangeParam}|${valueParam}|${filters.voter}`}
          label="Filter votes"
          results={results}
        >
          <Segmented
            name="range"
            label="Date range"
            value={rangeParam}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
              { value: "", label: "All time" },
            ]}
          />
          <Segmented
            name="value"
            label="Vote"
            value={valueParam}
            options={[
              { value: "", label: "All" },
              { value: "up", label: "👍 Up" },
              { value: "down", label: "👎 Down" },
            ]}
          />
          <SelectField
            name="voter"
            label="Voter"
            value={filters.voter}
            options={voterOptions}
            className="w-full basis-56 sm:w-auto"
          />
          {filtered && (
            <Link href="/votes" className="btn btn-ghost h-11">
              Reset
            </Link>
          )}
        </FilterBar>
      )}
    </div>
  );
}
