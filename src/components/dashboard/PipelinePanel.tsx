import Link from "next/link";
import { Suspense } from "react";
import { bigNumber, percent, plural } from "@/components/charts/chart-utils";
import { fallbackCounts, formatMs, median } from "@/components/pipeline/pipeline-utils";
import SetupNotice from "@/components/SetupNotice";
import type { Supabase } from "@/lib/admin";
import type { GenerationRequest, LlmResponse } from "@/lib/domain";
import { prettyModel } from "@/lib/joke-styles";
import { isMissingSchema } from "@/lib/setup";
import { RECENT_DAYS } from "@/lib/stats";

/**
 * Dashboard panel: how Caption Arena's AI pipeline did over the last week,
 * from generation_requests (one row per upload / "more jokes" / re-describe run) and
 * llm_responses (one row per model call). Server component; it streams in
 * after the rest of the dashboard so a slow query never blocks the page.
 */

type RequestRow = Pick<GenerationRequest, "status" | "started_at" | "finished_at">;
type CallRow = Pick<LlmResponse, "request_id" | "step_order" | "attempt" | "status" | "api_model_id">;
type DbError = { code?: string | null; message: string };

type PipelineStats = {
  requests: number;
  succeeded: number;
  failed: number;
  running: number;
  /** succeeded / (succeeded + failed); null when nothing finished. */
  successRate: number | null;
  medianMs: number | null;
  timed: number;
  calls: number;
  failedCalls: number;
  /** Successful pipeline steps (request + step) and how many needed a backup model. */
  okSteps: number;
  fellBack: number;
  topModel: { id: string; calls: number; share: number } | null;
};

type Loaded = { ok: true; stats: PipelineStats } | { ok: false; missing: boolean; message: string };

const DAY_MS = 86_400_000;
const PAGE = 1000;
const MAX_ROWS = 20_000;

/** Pages through a query, keeping the PostgREST error (and its code) intact. */
async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError | null }>,
): Promise<{ rows: T[]; error: DbError | null }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { rows, error };
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return { rows, error: null };
}

function summarize(requests: RequestRow[], calls: CallRow[]): PipelineStats {
  let succeeded = 0;
  let failed = 0;
  let running = 0;
  const durations: number[] = [];
  for (const r of requests) {
    if (r.status === "succeeded") succeeded++;
    else if (r.status === "failed") failed++;
    else running++;
    if (r.status !== "running" && r.finished_at) {
      const ms = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime();
      if (Number.isFinite(ms) && ms >= 0) durations.push(ms);
    }
  }

  const okByModel = new Map<string, number>();
  let failedCalls = 0;
  for (const c of calls) {
    if (c.status === "ok") okByModel.set(c.api_model_id, (okByModel.get(c.api_model_id) ?? 0) + 1);
    else failedCalls++;
  }
  const { fellBack, okSteps } = fallbackCounts(calls);

  let topModel: PipelineStats["topModel"] = null;
  const okCalls = calls.length - failedCalls;
  for (const [id, n] of okByModel) {
    if (!topModel || n > topModel.calls || (n === topModel.calls && id < topModel.id)) {
      topModel = { id, calls: n, share: okCalls ? n / okCalls : 0 };
    }
  }

  const finished = succeeded + failed;
  return {
    requests: requests.length,
    succeeded,
    failed,
    running,
    successRate: finished ? succeeded / finished : null,
    medianMs: median(durations),
    timed: durations.length,
    calls: calls.length,
    failedCalls,
    okSteps,
    fellBack,
    topModel,
  };
}

async function loadPipeline(supabase: Supabase): Promise<Loaded> {
  const since = new Date(Date.now() - RECENT_DAYS * DAY_MS).toISOString();
  try {
    const [requests, calls] = await Promise.all([
      pageAll<RequestRow>((from, to) =>
        supabase
          .from("generation_requests")
          .select("status, started_at, finished_at")
          .gte("started_at", since)
          .order("started_at", { ascending: false })
          .order("id")
          .range(from, to)
          .overrideTypes<RequestRow[], { merge: false }>(),
      ),
      pageAll<CallRow>((from, to) =>
        supabase
          .from("llm_responses")
          .select("request_id, step_order, attempt, status, api_model_id")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to)
          .overrideTypes<CallRow[], { merge: false }>(),
      ),
    ]);
    const error = requests.error ?? calls.error;
    if (error) return { ok: false, missing: isMissingSchema(error), message: error.message };
    return { ok: true, stats: summarize(requests.rows, calls.rows) };
  } catch (err) {
    return { ok: false, missing: false, message: err instanceof Error ? err.message : "Unknown error." };
  }
}

function Figure({
  label,
  value,
  note,
  title,
  wrap = false,
}: {
  label: string;
  value: string;
  note: string;
  title?: string;
  /** Smaller text that wraps instead of truncating (long names like "Gemini 3.5 Flash-Lite"). */
  wrap?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-background/70 p-3">
      <dt className="truncate text-xs font-medium text-muted">{label}</dt>
      <dd
        className={`mt-0.5 font-semibold tracking-tight ${wrap ? "text-lg leading-tight break-words" : "truncate text-2xl tabular-nums"}`}
        title={title}
      >
        {value}
      </dd>
      <dd className="mt-0.5 text-xs leading-snug text-muted">{note}</dd>
    </div>
  );
}

async function PipelineFigures({ supabase }: { supabase: Supabase }) {
  const loaded = await loadPipeline(supabase);

  if (!loaded.ok) {
    if (loaded.missing) return <SetupNotice what="The AI pipeline log tables (generation_requests, llm_responses)" />;
    return (
      <p role="alert" className="rounded-xl border-2 border-danger/40 bg-danger/10 p-3 text-sm text-danger">
        <span className="font-semibold">Couldn&apos;t load pipeline stats.</span> {loaded.message}
      </p>
    );
  }

  const s = loaded.stats;
  if (s.requests === 0 && s.calls === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-background/70 p-4 text-sm">
        <span aria-hidden className="text-2xl">
          😴
        </span>
        <p>
          <span className="font-semibold">No AI runs in the last {RECENT_DAYS} days.</span>{" "}
          <span className="text-muted">
            Every AI upload, &ldquo;more jokes&rdquo; and re-describe run is logged here.
          </span>
        </p>
      </div>
    );
  }

  const finished = s.succeeded + s.failed;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Figure
        label="Generation requests"
        value={bigNumber(s.requests)}
        note={s.running ? `${bigNumber(s.running)} still running` : "Every AI run"}
      />
      <Figure
        label="Success rate"
        value={percent(s.successRate)}
        note={finished ? `${bigNumber(s.succeeded)} of ${plural(finished, "finished run")}` : "Nothing finished yet"}
      />
      <Figure
        label="Median duration"
        value={formatMs(s.medianMs)}
        note={s.timed ? `Start to finish, ${plural(s.timed, "run")}` : "No finished runs"}
      />
      <Figure
        label="LLM calls"
        value={bigNumber(s.calls)}
        note={s.failedCalls ? `${bigNumber(s.failedCalls)} failed or empty` : "None failed"}
      />
      <Figure
        label="Fallback rate"
        value={percent(s.okSteps ? s.fellBack / s.okSteps : null)}
        note={
          s.okSteps
            ? `${bigNumber(s.fellBack)} of ${plural(s.okSteps, "successful step")} needed a backup model`
            : "No successful steps"
        }
      />
      <Figure
        label="Top model"
        value={s.topModel ? prettyModel(s.topModel.id) : "—"}
        title={s.topModel?.id}
        wrap={!!s.topModel}
        note={s.topModel ? `${percent(s.topModel.share)} of successful calls` : "No successful calls"}
      />
    </dl>
  );
}

function PipelineSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" role="status">
      <span className="sr-only">Loading AI pipeline stats…</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} aria-hidden className="h-[88px] animate-pulse rounded-xl bg-background/70" />
      ))}
    </div>
  );
}

/** "AI pipeline, last 7 days" card with links to the request and response logs. */
export default function PipelinePanel({ supabase }: { supabase: Supabase }) {
  return (
    <section aria-labelledby="pipeline-title" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pipeline-title" className="text-xl font-bold">
            AI pipeline
          </h2>
          <p className="mt-0.5 text-sm text-muted">Caption generation in the last {RECENT_DAYS} days.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/requests" className="btn btn-secondary btn-sm">
            Generation requests →
          </Link>
          <Link href="/llm-responses" className="btn btn-secondary btn-sm">
            LLM responses →
          </Link>
        </div>
      </div>
      <div className="mt-4">
        <Suspense fallback={<PipelineSkeleton />}>
          <PipelineFigures supabase={supabase} />
        </Suspense>
      </div>
    </section>
  );
}
