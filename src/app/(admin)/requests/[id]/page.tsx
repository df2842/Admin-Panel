import Link from "next/link";
import { notFound } from "next/navigation";
import SetupNotice from "@/components/SetupNotice";
import { Expandable } from "@/components/pipeline/PromptBlock";
import {
  AttemptBadge,
  CallStatusBadge,
  KindBadge,
  RequestStatusBadge,
  StepLabel,
  styleLabel,
} from "@/components/pipeline/badges";
import { durationMs, formatMs, plural, STALE_RUN_MS } from "@/components/pipeline/pipeline-utils";
import { Avatar, ErrorCard } from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import type { LlmResponse } from "@/lib/domain";
import { displayName, formatDateTime, signed, timeAgo } from "@/lib/format";
import { prettyModel } from "@/lib/joke-styles";
import { modelLabel } from "@/lib/media";
import { errorMessage, param, shortId, UUID, type SearchParams } from "@/lib/people";
import { loadRequest, parseId, SchemaMissingError, type RequestDetail } from "@/lib/pipeline-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Generation request" };

/** Request time, read once per render so every "x ago" agrees. */
function requestTime(): number {
  return Date.now();
}

const DOT: Record<LlmResponse["status"], string> = {
  ok: "bg-emerald-500",
  error: "bg-danger",
  empty: "bg-accent",
};

function tokens(input: number | null, output: number | null): string {
  if (input === null && output === null) return "—";
  const n = (v: number | null) => (v === null ? "?" : v.toLocaleString("en-US"));
  return `${n(input)} in · ${n(output)} out`;
}

function scoreClass(score: number): string {
  if (score > 0) return "bg-(--score-pos-bg) text-(--score-pos-fg)";
  if (score < 0) return "bg-(--score-neg-bg) text-(--score-neg-fg)";
  return "bg-border text-foreground";
}

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { supabase } = await requireAdmin();
  const { id: rawId } = await params;
  if (typeof rawId !== "string" || !UUID.test(rawId)) notFound();
  const id = rawId.toLowerCase();
  // /llm-responses links here with ?call=<id>#call-<id>: open and outline that call.
  const targetCall = parseId(param(await searchParams, "call", 16));

  let detail: RequestDetail | null = null;
  let missing = false;
  let error: string | null = null;
  try {
    detail = await loadRequest(supabase, id);
  } catch (err) {
    if (err instanceof SchemaMissingError) missing = true;
    else error = errorMessage(err);
  }
  if (!missing && !error && !detail) notFound();
  const now = requestTime();

  const back = (
    <Link href="/requests" className="btn btn-ghost -ml-3 mb-4">
      ← All requests
    </Link>
  );

  if (missing || error || !detail) {
    return (
      <div className="mx-auto max-w-6xl">
        {back}
        {missing ? (
          <SetupNotice what="The generation request tables" />
        ) : (
          <ErrorCard title="Couldn't load this request" message={error ?? "Unknown error."} />
        )}
      </div>
    );
  }

  const { request: r, imageUrl, chain, user, calls, captions, captionsError, modelNames } = detail;
  const userName = user ? displayName(user) : `User ${shortId(r.user_id)}`;
  const ms = durationMs(r.started_at, r.finished_at);
  const stale = r.status === "running" && now - new Date(r.started_at).getTime() > STALE_RUN_MS;
  const totalLatency = calls.reduce((sum, c) => sum + (c.latency_ms ?? 0), 0);
  const totalIn = calls.reduce((sum, c) => sum + (c.input_tokens ?? 0), 0);
  const totalOut = calls.reduce((sum, c) => sum + (c.output_tokens ?? 0), 0);
  const failedCalls = calls.filter((c) => c.status !== "ok").length;

  return (
    <div className="mx-auto max-w-6xl">
      {back}

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Generation request</h1>
          <RequestStatusBadge status={r.status} stale={stale} />
          <KindBadge kind={r.kind} />
        </div>
        <p className="mt-1 text-sm text-muted">
          Started <time dateTime={r.started_at}>{timeAgo(r.started_at, now)}</time> ({formatDateTime(r.started_at)}) by{" "}
          <Link href={`/users/${r.user_id}`} className="font-semibold text-foreground hover:text-primary hover:underline">
            {userName}
          </Link>
        </p>
      </header>

      {r.error && (
        <div role="note" className="card mb-6 border-danger/50 p-4 sm:p-5">
          <p className="font-semibold text-danger">
            <span aria-hidden>⚠️</span> Error recorded for this request
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words font-mono text-sm">{r.error}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Left: photo, facts, captions */}
        <div className="space-y-6">
          {r.image_id && imageUrl ? (
            <Link
              href={`/media/${r.image_id}`}
              className="card block overflow-hidden transition hover:ring-2 hover:ring-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              title="Open photo details"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Photo this request wrote jokes for" className="max-h-80 w-full bg-border/40 object-contain" />
            </Link>
          ) : (
            <div className="card grid h-40 place-items-center p-4 text-center text-sm text-muted">
              <p>
                <span aria-hidden className="block text-3xl">
                  🖼️
                </span>
                {r.image_id ? "Photo unavailable" : "No photo linked (it may have been deleted)"}
              </p>
            </div>
          )}

          <dl className="card grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 p-4 text-sm sm:p-5">
            <dt className="text-muted">User</dt>
            <dd className="min-w-0">
              <Link href={`/users/${r.user_id}`} className="group flex min-w-0 items-center gap-2 font-semibold">
                <Avatar src={user?.avatar_url} name={user ? userName : "?"} size="sm" />
                <span className="truncate group-hover:text-primary group-hover:underline">{userName}</span>
              </Link>
              {user?.email && user.full_name && <span className="block truncate text-xs text-muted">{user.email}</span>}
            </dd>
            <dt className="text-muted">Started</dt>
            <dd>{formatDateTime(r.started_at)}</dd>
            <dt className="text-muted">Finished</dt>
            <dd>
              {r.finished_at ? (
                formatDateTime(r.finished_at)
              ) : (
                <span className="text-muted">{stale ? "Never (probably crashed)" : "Still running"}</span>
              )}
            </dd>
            <dt className="text-muted">Duration</dt>
            <dd className="font-semibold tabular-nums">{formatMs(ms)}</dd>
            <dt className="text-muted">Style</dt>
            <dd>{styleLabel(r.style)}</dd>
            <dt className="text-muted">Chain</dt>
            <dd>
              {chain ? (
                <Link href={`/prompt-chains/${chain.id}`} className="font-semibold text-primary hover:underline">
                  {chain.name}
                </Link>
              ) : (
                <span className="text-muted">—</span>
              )}
            </dd>
            <dt className="text-muted">Jokes</dt>
            <dd className="tabular-nums">{r.caption_count}</dd>
            {r.image_id && (
              <>
                <dt className="text-muted">Photo ID</dt>
                <dd className="min-w-0">
                  <Link href={`/media/${r.image_id}`} className="break-all font-mono text-xs text-primary hover:underline">
                    {r.image_id}
                  </Link>
                </dd>
              </>
            )}
            <dt className="text-muted">Request ID</dt>
            <dd className="break-all font-mono text-xs">{r.id}</dd>
          </dl>

          <section className="card p-4 sm:p-5" aria-labelledby="captions-title">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="captions-title" className="text-lg font-bold">
                Jokes it produced
              </h2>
              {!captionsError && <span className="text-sm tabular-nums text-muted">{captions.length}</span>}
            </div>
            {captionsError ? (
              <p className="text-sm text-muted">{captionsError}</p>
            ) : captions.length === 0 ? (
              <p className="text-sm text-muted">
                {r.caption_count > 0
                  ? `This run reported ${plural(r.caption_count, "joke")}, but none are linked to it any more (they may have been deleted).`
                  : "No jokes are linked to this request."}
              </p>
            ) : (
              <>
                <ol className="space-y-2">
                  {captions.map((c) => (
                    <li key={c.id} className="rounded-xl border border-border p-3">
                      <p className="break-words font-medium leading-snug">{c.text}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span
                          className={`badge tabular-nums ${scoreClass(c.score)}`}
                          title={`👍 ${c.upvotes} · 👎 ${c.downvotes}`}
                        >
                          {signed(c.score)}
                        </span>
                        <span className="tabular-nums">
                          <span aria-hidden>👍</span> {c.upvotes} · <span aria-hidden>👎</span> {c.downvotes}
                        </span>
                        <span className="badge bg-border/70 text-foreground">{modelLabel(c.model)}</span>
                        <Link href={`/media/${c.image_id}`} className="font-semibold text-primary hover:underline">
                          Photo →
                        </Link>
                      </p>
                    </li>
                  ))}
                </ol>
                {r.caption_count > captions.length && (
                  <p className="mt-3 text-xs text-muted">
                    The run reported {r.caption_count}; {r.caption_count - captions.length} have since been deleted.
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        {/* Right: LLM call timeline */}
        <section aria-labelledby="calls-title" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="calls-title" className="text-lg font-bold">
              LLM calls
            </h2>
            {calls.length > 0 && (
              <p className="text-xs text-muted">
                {plural(calls.length, "call")}
                {failedCalls > 0 ? ` · ${failedCalls} not ok` : ""} · {formatMs(totalLatency)} total ·{" "}
                {totalIn.toLocaleString("en-US")} in / {totalOut.toLocaleString("en-US")} out tokens
              </p>
            )}
          </div>

          {calls.length === 0 ? (
            <div className="card p-6 text-center text-sm text-muted">
              <p className="text-3xl" aria-hidden>
                📭
              </p>
              <p className="mt-2">No LLM calls were logged for this request.</p>
            </div>
          ) : (
            <ol className="ml-3 space-y-4 border-l-2 border-border">
              {calls.map((c) => {
                const model = modelNames.get(c.api_model_id) ?? prettyModel(c.api_model_id);
                const targeted = c.id === targetCall;
                return (
                  <li key={c.id} id={`call-${c.id}`} className="relative scroll-mt-24 pl-6">
                    <span
                      aria-hidden
                      className={`absolute -left-[9px] top-5 h-4 w-4 rounded-full border-2 border-card ${DOT[c.status] ?? "bg-border"}`}
                    />
                    <article
                      className={`card space-y-3 p-4 ${targeted ? "ring-2 ring-primary" : ""}`}
                      aria-label={`Step ${c.step_order}, attempt ${c.attempt}`}
                      aria-current={targeted ? "true" : undefined}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StepLabel order={c.step_order} name={c.step_name} />
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <AttemptBadge attempt={c.attempt} />
                          <CallStatusBadge status={c.status} />
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                        <div className="col-span-2 min-w-0 sm:col-span-1">
                          <dt className="text-muted">Model</dt>
                          <dd className="truncate font-semibold" title={c.api_model_id}>
                            {model}
                          </dd>
                          <dd className="truncate font-mono text-[11px] text-muted">{c.api_model_id}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Latency</dt>
                          <dd className="font-semibold tabular-nums">{formatMs(c.latency_ms)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Tokens</dt>
                          <dd className="font-semibold tabular-nums">{tokens(c.input_tokens, c.output_tokens)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">At</dt>
                          <dd className="tabular-nums">{formatDateTime(c.created_at)}</dd>
                        </div>
                      </dl>
                      {c.error && (
                        <p className="whitespace-pre-wrap break-words rounded-xl bg-danger/10 p-3 font-mono text-xs text-danger">
                          {c.error}
                        </p>
                      )}
                      <div className="space-y-2">
                        <Expandable label="Prompt" text={c.prompt} />
                        <Expandable label="Response" text={c.response_text} open={targeted} />
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
