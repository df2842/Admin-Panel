import Link from "next/link";
import type { ReactNode } from "react";
import SetupNotice from "@/components/SetupNotice";
import { KIND_ICON, KIND_LABEL, KindBadge, RequestStatusBadge, styleLabel } from "@/components/pipeline/badges";
import { durationMs, excerpt, formatMs, percent, plural, STALE_RUN_MS } from "@/components/pipeline/pipeline-utils";
import FilterBar from "@/components/tables/FilterBar";
import { Segmented, SelectField } from "@/components/tables/controls";
import {
  Avatar,
  EmptyState,
  ErrorCard,
  NUM,
  PageHeader,
  Pagination,
  StatTile,
  TableCard,
  TD,
  TH,
  Thumb,
} from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import { compactNumber, displayName, formatDateTime, timeAgo } from "@/lib/format";
import { errorMessage, hrefWith, shortId, type SearchParams } from "@/lib/people";
import {
  loadRequests,
  parseRequestFilters,
  REQUEST_KINDS,
  REQUESTS_PER_PAGE,
  SchemaMissingError,
  type RequestRange,
  type RequestsPageData,
} from "@/lib/pipeline-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Generation requests" };

const RANGE_LABEL: Record<RequestRange, string> = { "": "All time", "7d": "Last 7 days", "30d": "Last 30 days" };

/** Request time, read once per render so ranges and "x ago" agree. */
function requestTime(): number {
  return Date.now();
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { supabase } = await requireAdmin();
  const f = parseRequestFilters(await searchParams);
  const now = requestTime();

  let data: RequestsPageData | null = null;
  let missing = false;
  let error: string | null = null;
  try {
    data = await loadRequests(supabase, f, now);
  } catch (err) {
    if (err instanceof SchemaMissingError) missing = true;
    else error = errorMessage(err);
  }

  const chainParam = f.chain ? String(f.chain) : "";
  const filtered = !!(f.status || f.kind || f.range || f.chain);
  const query = { status: f.status, kind: f.kind, range: f.range, chain: chainParam };
  const hrefFor = (page: number) => hrefWith("/requests", { ...query, page: page > 1 ? page : "" });

  let results: ReactNode = null;
  if (data) {
    const { total, succeeded, failed, running, medianMs, finished, rows, page, totalPages, people } = data;
    const first = (page - 1) * REQUESTS_PER_PAGE + 1;

    results = (
      <div className="mt-6">
        <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
          <StatTile
            label="Requests"
            value={compactNumber(total)}
            sub={`${RANGE_LABEL[f.range]}${running ? ` · ${running} running` : ""}`}
          />
          <StatTile
            label="Success rate"
            value={percent(succeeded, succeeded + failed)}
            sub={succeeded + failed > 0 ? `${succeeded} of ${succeeded + failed} finished runs` : "No finished runs"}
          />
          <StatTile
            label="Median duration"
            value={formatMs(medianMs)}
            sub={finished > 0 ? `Start to finish, ${plural(finished, "run")}` : "No finished runs"}
          />
          <StatTile
            label="Failures"
            value={compactNumber(failed)}
            sub={
              failed > 0 && f.status !== "failed" ? (
                <Link href={hrefWith("/requests", { ...query, status: "failed" })} className="font-semibold text-primary hover:underline">
                  Show only failures →
                </Link>
              ) : failed === 0 && total > 0 ? (
                "None in this view"
              ) : (
                ""
              )
            }
          />
        </div>

        {total === 0 ? (
          filtered ? (
            <EmptyState icon="🔍" title="No requests match these filters">
              <p>Try a wider date range or a different status.</p>
              <Link href="/requests" className="btn btn-secondary">
                Show all requests
              </Link>
            </EmptyState>
          ) : (
            <EmptyState icon="🤖" title="No generation requests yet">
              <p>Every AI upload, &ldquo;more jokes&rdquo; and re-describe run is logged here, from Caption Arena or this panel.</p>
            </EmptyState>
          )
        ) : (
          <>
            {/* Fits ~690px (1024px window): Kind and View show from xl, Photo and Error from 2xl. */}
            <TableCard minWidth={600} caption="Generation requests, newest first">
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Started
                  </th>
                  <th scope="col" className={TH}>
                    Status
                  </th>
                  <th scope="col" className={TH}>
                    User
                  </th>
                  <th scope="col" className={`${TH} hidden xl:table-cell`} title="Kind of run and joke style">
                    Kind
                  </th>
                  <th scope="col" className={`${TH} ${NUM}`}>
                    Duration
                  </th>
                  <th scope="col" className={`${TH} ${NUM}`} title="Captions this request produced">
                    Jokes
                  </th>
                  <th scope="col" className={`${TH} hidden 2xl:table-cell`}>
                    Photo
                  </th>
                  <th scope="col" className={`${TH} hidden 2xl:table-cell`}>
                    Error
                  </th>
                  <th scope="col" className={`${TH} hidden xl:table-cell`}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const href = `/requests/${r.id}`;
                  const user = people.get(r.user_id) ?? null;
                  const name = user ? displayName(user) : `User ${shortId(r.user_id)}`;
                  const ms = durationMs(r.started_at, r.finished_at);
                  const stale = r.status === "running" && now - new Date(r.started_at).getTime() > STALE_RUN_MS;
                  return (
                    <tr key={r.id} className="transition hover:bg-background/70">
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={href} className="font-semibold hover:text-primary hover:underline">
                          <time dateTime={r.started_at}>{timeAgo(r.started_at, now)}</time>
                        </Link>
                        <span className="block text-xs text-muted">{formatDateTime(r.started_at)}</span>
                      </td>
                      <td className={TD}>
                        <RequestStatusBadge status={r.status} stale={stale} />
                        {r.error && (
                          <p
                            className="mt-1 line-clamp-2 max-w-[10rem] text-xs text-danger wrap-anywhere 2xl:hidden"
                            title={r.error}
                          >
                            {excerpt(r.error, 80)}
                          </p>
                        )}
                      </td>
                      <td className={TD}>
                        <Link
                          href={`/users/${r.user_id}`}
                          className="group flex min-w-0 items-center gap-2.5 font-semibold"
                          title={user?.email ?? r.user_id}
                        >
                          <Avatar src={user?.avatar_url} name={user ? name : "?"} size="sm" />
                          <span
                            className={`max-w-[9rem] truncate group-hover:text-primary group-hover:underline xl:max-w-[11rem] ${user ? "" : "font-mono text-xs"}`}
                          >
                            {name}
                          </span>
                        </Link>
                      </td>
                      <td className={`${TD} hidden xl:table-cell`}>
                        <KindBadge kind={r.kind} />
                        {r.style && (
                          <span className="mt-1 block whitespace-nowrap text-xs text-muted">{styleLabel(r.style)}</span>
                        )}
                      </td>
                      <td className={`${TD} ${NUM} whitespace-nowrap`}>
                        {ms !== null ? (
                          formatMs(ms)
                        ) : (
                          <span className="text-muted">{stale ? "never finished" : r.status === "running" ? "running…" : "—"}</span>
                        )}
                      </td>
                      <td className={`${TD} ${NUM}`}>
                        {r.kind === "describe" ? (
                          <span className="text-muted" title="Re-describe runs don't write jokes">
                            —
                          </span>
                        ) : (
                          <span className={r.caption_count === 0 ? "text-muted" : "font-semibold"}>{r.caption_count}</span>
                        )}
                      </td>
                      <td className={`${TD} hidden w-20 2xl:table-cell`}>
                        {r.image_id && r.imageUrl ? (
                          <Thumb href={`/media/${r.image_id}`} src={r.imageUrl} alt="Photo for this request" size={48} />
                        ) : (
                          <span className="text-muted" title={r.image_id ? undefined : "No photo, or it was deleted"}>
                            —
                          </span>
                        )}
                      </td>
                      <td className={`${TD} hidden max-w-[16rem] 2xl:table-cell`}>
                        {r.error ? (
                          <p className="line-clamp-2 break-words text-xs text-danger" title={r.error}>
                            {excerpt(r.error, 120)}
                          </p>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className={`${TD} hidden text-right xl:table-cell`}>
                        <Link href={href} className="btn btn-secondary btn-sm">
                          View
                        </Link>
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
                </>
              }
            />
          </>
        )}
      </div>
    );
  }

  const chains = data?.chains ?? [];
  const chainOptions = [
    { value: "", label: "All chains" },
    ...chains.map((c) => ({ value: String(c.id), label: c.name })),
  ];
  if (f.chain && !chains.some((c) => c.id === f.chain)) chainOptions.push({ value: chainParam, label: `Chain #${f.chain}` });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Generation requests"
        description="Every AI run (uploads, “more jokes”, re-describes), newest first. Read-only."
      />

      {missing && <SetupNotice what="The generation request tables" />}
      {error && <ErrorCard message={error} />}

      {data && (
        <FilterBar
          action="/requests"
          stateKey={`${f.status}|${f.kind}|${f.range}|${chainParam}`}
          label="Filter generation requests"
          results={results}
        >
          <Segmented
            name="status"
            label="Status"
            value={f.status}
            options={[
              { value: "", label: "All" },
              { value: "running", label: "⏳ Running" },
              { value: "succeeded", label: "✓ Succeeded" },
              { value: "failed", label: "✕ Failed" },
            ]}
          />
          <Segmented
            name="kind"
            label="Kind"
            value={f.kind}
            options={[
              { value: "", label: "All" },
              ...REQUEST_KINDS.map((k) => ({ value: k, label: `${KIND_ICON[k]} ${KIND_LABEL[k]}` })),
            ]}
          />
          <Segmented
            name="range"
            label="Started"
            value={f.range}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "", label: "All time" },
            ]}
          />
          {(chains.length > 1 || f.chain) && (
            <SelectField
              name="chain"
              label="Prompt chain"
              value={chainParam}
              options={chainOptions}
              className="w-full basis-52 sm:w-auto"
            />
          )}
          {filtered && (
            <Link href="/requests" className="btn btn-ghost h-11">
              Reset
            </Link>
          )}
        </FilterBar>
      )}
    </div>
  );
}
