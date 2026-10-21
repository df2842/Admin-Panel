import Link from "next/link";
import type { ReactNode } from "react";
import SetupNotice from "@/components/SetupNotice";
import { AttemptBadge, CallStatusBadge, StepLabel } from "@/components/pipeline/badges";
import { excerpt, formatMs, percent, plural } from "@/components/pipeline/pipeline-utils";
import FilterBar from "@/components/tables/FilterBar";
import { Segmented, SelectField } from "@/components/tables/controls";
import {
  EmptyState,
  ErrorCard,
  NUM,
  PageHeader,
  Pagination,
  StatTile,
  TableCard,
  TD,
  TH,
} from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import { compactNumber, formatDateTime, timeAgo } from "@/lib/format";
import { prettyModel } from "@/lib/joke-styles";
import { errorMessage, hrefWith, type SearchParams } from "@/lib/people";
import {
  loadResponses,
  parseResponseFilters,
  RESPONSES_PER_PAGE,
  SchemaMissingError,
  type ResponsesPageData,
} from "@/lib/pipeline-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "LLM responses" };

/** Request time, read once per render so every "x ago" agrees. */
function requestTime(): number {
  return Date.now();
}

function tokens(input: number | null, output: number | null): ReactNode {
  if (input === null && output === null) return <span className="text-muted">—</span>;
  const n = (v: number | null) => (v === null ? "?" : compactNumber(v));
  return (
    <span title={`${input ?? "?"} input tokens, ${output ?? "?"} output tokens`}>
      {n(input)} <span className="text-muted">→</span> {n(output)}
    </span>
  );
}

export default async function LlmResponsesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { supabase } = await requireAdmin();
  const f = parseResponseFilters(await searchParams);

  let data: ResponsesPageData | null = null;
  let missing = false;
  let error: string | null = null;
  try {
    data = await loadResponses(supabase, f);
  } catch (err) {
    if (err instanceof SchemaMissingError) missing = true;
    else error = errorMessage(err);
  }
  const now = requestTime();

  const stepParam = f.step === null ? "" : String(f.step);
  const filtered = !!(f.status || f.model || stepParam);
  const hrefFor = (page: number) =>
    hrefWith("/llm-responses", { status: f.status, model: f.model, step: stepParam, page: page > 1 ? page : "" });

  let results: ReactNode = null;
  if (data) {
    const { total, requests, errors, empties, avgOkLatencyMs, okWithLatency, fellBack, okSteps, rows, page, totalPages, modelNames } =
      data;
    const first = (page - 1) * RESPONSES_PER_PAGE + 1;

    results = (
      <div className="mt-6">
        <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
          <StatTile label="LLM calls" value={compactNumber(total)} sub={`All time · ${plural(requests, "request")}`} />
          <StatTile
            label="Error rate"
            value={percent(errors + empties, total)}
            sub={total > 0 ? `${errors} error${errors === 1 ? "" : "s"} · ${empties} empty` : "No calls"}
          />
          <StatTile
            label="Avg latency (ok calls)"
            value={formatMs(avgOkLatencyMs)}
            sub={okWithLatency > 0 ? `Across ${plural(okWithLatency, "ok call")}` : "No ok calls"}
          />
          <StatTile
            label="Fallback rate"
            value={percent(fellBack, okSteps)}
            sub={
              okSteps > 0
                ? `${fellBack} of ${plural(okSteps, "successful step")} needed a backup model`
                : "No successful steps in view"
            }
          />
        </div>

        {total === 0 ? (
          filtered ? (
            <EmptyState icon="🔍" title="No calls match these filters">
              <p>Try another status, model or step.</p>
              <Link href="/llm-responses" className="btn btn-secondary">
                Show all calls
              </Link>
            </EmptyState>
          ) : (
            <EmptyState icon="🧠" title="No LLM calls logged yet">
              <p>Every model call made while describing photos or writing jokes is logged here.</p>
            </EmptyState>
          )
        ) : (
          <>
            {/* Fits ~690px (1024px window): Step, Latency and View only show on wider screens. */}
            <TableCard minWidth={600} caption="LLM calls, newest first">
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    When
                  </th>
                  <th scope="col" className={TH}>
                    Status
                  </th>
                  <th scope="col" className={`${TH} hidden 2xl:table-cell`}>
                    Step
                  </th>
                  <th scope="col" className={TH}>
                    Model
                  </th>
                  <th scope="col" className={`${TH} ${NUM} hidden xl:table-cell`} title="Latency, then input → output tokens">
                    Latency
                  </th>
                  <th scope="col" className={TH}>
                    Response
                  </th>
                  <th scope="col" className={`${TH} hidden xl:table-cell`}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  // ?call= opens this call's response on the request page; the hash scrolls to it.
                  const callHref = `/requests/${c.request_id}?call=${c.id}#call-${c.id}`;
                  const text = c.status === "ok" ? c.response_text : (c.error ?? c.response_text);
                  return (
                    <tr key={c.id} className="transition hover:bg-background/70">
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={callHref} className="font-semibold hover:text-primary hover:underline">
                          <time dateTime={c.created_at}>{timeAgo(c.created_at, now)}</time>
                        </Link>
                        <span className="block text-xs text-muted">{formatDateTime(c.created_at)}</span>
                      </td>
                      <td className={TD}>
                        <div className="flex flex-col items-start gap-1">
                          <CallStatusBadge status={c.status} />
                          {c.attempt > 1 && <AttemptBadge attempt={c.attempt} />}
                        </div>
                      </td>
                      <td className={`${TD} hidden max-w-[13rem] 2xl:table-cell`}>
                        <StepLabel order={c.step_order} name={c.step_name} />
                      </td>
                      <td className={TD}>
                        <span className="block whitespace-nowrap font-semibold" title={c.api_model_id}>
                          {modelNames.get(c.api_model_id) ?? prettyModel(c.api_model_id)}
                        </span>
                        <span className="block text-xs text-muted 2xl:hidden">
                          Step {c.step_order} · {c.step_name}
                        </span>
                        <span className="hidden truncate font-mono text-[11px] text-muted 2xl:block">{c.api_model_id}</span>
                      </td>
                      <td className={`${TD} ${NUM} hidden whitespace-nowrap xl:table-cell`}>
                        {formatMs(c.latency_ms)}
                        <span className="block text-xs">{tokens(c.input_tokens, c.output_tokens)}</span>
                      </td>
                      <td className={TD}>
                        {text ? (
                          <p
                            className={`line-clamp-2 text-xs wrap-anywhere ${c.status === "ok" ? "font-mono" : "text-danger"}`}
                            title={excerpt(text, 600)}
                          >
                            {excerpt(text, 160)}
                          </p>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className={`${TD} hidden text-right xl:table-cell`}>
                        <Link href={callHref} className="btn btn-secondary btn-sm">
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

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="LLM responses"
        description="Every AI model call, newest first, including failed attempts and fallbacks. Read-only."
      />

      {missing && <SetupNotice what="The LLM response tables" />}
      {error && <ErrorCard message={error} />}

      {data && (
        <FilterBar
          action="/llm-responses"
          stateKey={`${f.status}|${f.model}|${stepParam}`}
          label="Filter LLM calls"
          results={results}
        >
          <Segmented
            name="status"
            label="Status"
            value={f.status}
            options={[
              { value: "", label: "All" },
              { value: "ok", label: "✓ OK" },
              { value: "error", label: "✕ Error" },
              { value: "empty", label: "∅ Empty" },
            ]}
          />
          <SelectField
            name="model"
            label="Model"
            value={f.model}
            options={[{ value: "", label: "All models" }, ...data.modelOptions]}
            className="w-full basis-64 sm:w-auto"
          />
          <SelectField
            name="step"
            label="Step"
            value={stepParam}
            options={[{ value: "", label: "All steps" }, ...data.stepOptions]}
            className="w-full basis-52 sm:w-auto"
          />
          {filtered && (
            <Link href="/llm-responses" className="btn btn-ghost h-11">
              Reset
            </Link>
          )}
        </FilterBar>
      )}
    </div>
  );
}
