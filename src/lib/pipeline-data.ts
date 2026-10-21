import type { Supabase } from "@/lib/admin";
import { fetchAll, profilesFor, scoresFor } from "@/lib/data";
import {
  PATTERNS,
  type GenerationRequest,
  type LlmModel,
  type LlmResponse,
  type PromptChain,
  type PromptChainMix,
  type PromptChainStep,
} from "@/lib/domain";
import { trustedImageUrl } from "@/lib/format";
import { param, parsePage, pickEnum, type SearchParams } from "@/lib/people";
import { isMissingSchema } from "@/lib/setup";
import type { CaptionRow, Profile } from "@/lib/types";
import { durationMs, fallbackCounts, median } from "@/components/pipeline/pipeline-utils";

/**
 * Read-only data for the AI pipeline screens: prompt chains (+ steps and
 * mix), generation requests and LLM responses. Every query runs with the
 * signed-in superadmin's session, so Row Level Security decides what comes
 * back. The only write on these screens (mix weights) lives in
 * src/app/(admin)/prompt-chains/actions.ts.
 */

const DAY_MS = 86_400_000;

/* ---- errors -------------------------------------------------------------- */

/** Thrown when week7-domain.sql hasn't been run, so pages can show <SetupNotice />. */
export class SchemaMissingError extends Error {
  constructor() {
    super("The week 7 tables don't exist yet.");
    this.name = "SchemaMissingError";
  }
}

type DbError = { message: string; code?: string | null } | null | undefined;

function check(error: DbError): void {
  if (!error) return;
  if (isMissingSchema(error)) throw new SchemaMissingError();
  throw new Error(error.message || "The database returned an error.");
}

async function rows<T>(query: PromiseLike<{ data: unknown; error: DbError }>): Promise<T[]> {
  const { data, error } = await query;
  check(error);
  return (data ?? []) as T[];
}

/** fetchAll (pages of 1,000) that keeps the "missing table" signal. */
function allRows<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: DbError }>): Promise<T[]> {
  return fetchAll<T>(async (from, to) => ({ data: await rows<T>(build(from, to)), error: null }));
}

/** PostgREST returns a many-to-one embed as an object, but be lenient about arrays. */
function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/** Positive bigint id from a URL segment (ids above 2^53 are rejected rather than rounded). */
export function parseId(raw: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/* ---- LLM models (labels and filter options) ------------------------------ */

export type ModelOption = Pick<LlmModel, "api_model_id" | "name" | "priority" | "is_active">;

/** Configured models, by fallback priority. Labels only, so failures return []. */
export async function loadModels(supabase: Supabase): Promise<ModelOption[]> {
  const { data, error } = await supabase
    .from("llm_models")
    .select("api_model_id, name, priority, is_active")
    .order("priority")
    .order("name")
    .limit(500);
  if (error || !data) return [];
  return data as ModelOption[];
}

/* ---- Prompt chains --------------------------------------------------------- */

const CHAIN_COLUMNS = "id, slug, name, description, is_active, created_at, updated_at";
const STEP_COLUMNS =
  "id, chain_id, step_order, name, purpose, input_type, output_type, system_prompt, user_prompt, temperature, created_at, updated_at";
const MIX_COLUMNS = "id, chain_id, flavor, label, instruction, weight, sort_order, created_at, updated_at";

type ChainRuns = { runs: number | null; lastRunAt: string | null };

/** How often a chain has run. Optional detail: errors become nulls. */
async function chainRuns(supabase: Supabase, chainId: number): Promise<ChainRuns> {
  const [countRes, lastRes] = await Promise.all([
    supabase.from("generation_requests").select("id", { count: "exact", head: true }).eq("chain_id", chainId),
    supabase
      .from("generation_requests")
      .select("started_at")
      .eq("chain_id", chainId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    runs: countRes.error ? null : (countRes.count ?? 0),
    lastRunAt: lastRes.error ? null : ((lastRes.data as { started_at: string } | null)?.started_at ?? null),
  };
}

export type ChainListItem = PromptChain &
  ChainRuns & {
    steps: number;
    flavors: number;
    /** Flavors with weight > 0 (used in "Mixed bag" batches). */
    weightedFlavors: number;
  };

export async function loadChains(supabase: Supabase): Promise<ChainListItem[]> {
  type Row = PromptChain & {
    prompt_chain_steps: { id: number }[] | null;
    prompt_chain_mix: { weight: number }[] | null;
  };
  const chains = await rows<Row>(
    supabase
      .from("prompt_chains")
      .select(`${CHAIN_COLUMNS}, prompt_chain_steps(id), prompt_chain_mix(weight)`)
      .order("is_active", { ascending: false })
      .order("name")
      .order("id"),
  );
  const runs = await Promise.all(chains.map((c) => chainRuns(supabase, c.id)));
  return chains.map(({ prompt_chain_steps, prompt_chain_mix, ...chain }, i) => ({
    ...chain,
    ...runs[i],
    steps: prompt_chain_steps?.length ?? 0,
    flavors: prompt_chain_mix?.length ?? 0,
    weightedFlavors: (prompt_chain_mix ?? []).filter((m) => Number(m.weight) > 0).length,
  }));
}

export type ChainDetail = ChainRuns & {
  chain: PromptChain;
  steps: PromptChainStep[];
  mix: PromptChainMix[];
};

/** One chain with its steps (in order) and its humor-flavor mix. Null if it doesn't exist. */
export async function loadChain(supabase: Supabase, id: number): Promise<ChainDetail | null> {
  const [chainRes, steps, mix, runs] = await Promise.all([
    supabase.from("prompt_chains").select(CHAIN_COLUMNS).eq("id", id).maybeSingle(),
    rows<PromptChainStep>(
      supabase.from("prompt_chain_steps").select(STEP_COLUMNS).eq("chain_id", id).order("step_order").order("id"),
    ),
    rows<PromptChainMix>(
      supabase.from("prompt_chain_mix").select(MIX_COLUMNS).eq("chain_id", id).order("sort_order").order("id"),
    ),
    chainRuns(supabase, id),
  ]);
  check(chainRes.error);
  if (!chainRes.data) return null;
  return {
    chain: chainRes.data as PromptChain,
    // numeric(3,2) arrives as a JSON number, but coerce in case a driver sends a string.
    steps: steps.map((s) => ({ ...s, temperature: Number(s.temperature) })),
    mix: mix.map((m) => ({ ...m, weight: Number(m.weight) })),
    ...runs,
  };
}

/* ---- Generation requests ----------------------------------------------------- */

export const REQUEST_STATUSES = ["running", "succeeded", "failed"] as const;
export const REQUEST_KINDS = ["upload", "more_jokes", "describe"] as const satisfies readonly GenerationRequest["kind"][];
/** "" = all time (empty values drop out of the URL). */
export const REQUEST_RANGES = ["", "7d", "30d"] as const;
export const REQUESTS_PER_PAGE = 50;

export type RequestRange = (typeof REQUEST_RANGES)[number];
const RANGE_DAYS: Record<Exclude<RequestRange, "">, number> = { "7d": 7, "30d": 30 };

export type RequestFilters = {
  status: "" | GenerationRequest["status"];
  kind: "" | GenerationRequest["kind"];
  range: RequestRange;
  /** Prompt chain id, or null for every chain. */
  chain: number | null;
  page: number;
};

export function parseRequestFilters(sp: SearchParams): RequestFilters {
  return {
    status: pickEnum(param(sp, "status", 12), ["", ...REQUEST_STATUSES], ""),
    kind: pickEnum(param(sp, "kind", 12), ["", ...REQUEST_KINDS], ""),
    range: pickEnum(param(sp, "range", 4), REQUEST_RANGES, ""),
    chain: parseId(param(sp, "chain", 16)),
    page: parsePage(param(sp, "page", 6)),
  };
}

const REQUEST_COLUMNS =
  "id, user_id, chain_id, image_id, kind, style, status, error, caption_count, started_at, finished_at";

export type RequestListRow = GenerationRequest & { imageUrl: string | null };

export type RequestsPageData = {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  /** Median finished_at - started_at over finished runs. */
  medianMs: number | null;
  finished: number;
  page: number;
  totalPages: number;
  rows: RequestListRow[];
  people: Map<string, Profile>;
  /** Chain names for labels and the chain filter. */
  chains: { id: number; name: string }[];
};

type EmbeddedImage = { id: string; public_url: string } | { id: string; public_url: string }[] | null;

export async function loadRequests(supabase: Supabase, f: RequestFilters, now: number): Promise<RequestsPageData> {
  const since = f.range ? new Date(now - RANGE_DAYS[f.range] * DAY_MS).toISOString() : null;
  const filtered = (columns: string) => {
    let q = supabase.from("generation_requests").select(columns);
    if (f.status) q = q.eq("status", f.status);
    if (f.kind) q = q.eq("kind", f.kind);
    if (f.chain) q = q.eq("chain_id", f.chain);
    if (since) q = q.gte("started_at", since);
    return q.order("started_at", { ascending: false }).order("id", { ascending: false });
  };

  type SummaryRow = Pick<GenerationRequest, "id" | "status" | "started_at" | "finished_at">;
  const summary = await allRows<SummaryRow>((from, to) =>
    filtered("id, status, started_at, finished_at").range(from, to),
  );

  let succeeded = 0;
  let failed = 0;
  const durations: number[] = [];
  for (const r of summary) {
    if (r.status === "succeeded") succeeded += 1;
    else if (r.status === "failed") failed += 1;
    if (r.status !== "running") {
      const ms = durationMs(r.started_at, r.finished_at);
      if (ms !== null) durations.push(ms);
    }
  }

  const total = summary.length;
  const totalPages = Math.max(1, Math.ceil(total / REQUESTS_PER_PAGE));
  const page = Math.min(f.page, totalPages);

  type Row = GenerationRequest & { images: EmbeddedImage };
  const from = (page - 1) * REQUESTS_PER_PAGE;
  const [pageRows, chains] = await Promise.all([
    total > 0
      ? rows<Row>(filtered(`${REQUEST_COLUMNS}, images(id, public_url)`).range(from, from + REQUESTS_PER_PAGE - 1))
      : Promise.resolve([] as Row[]),
    supabase
      .from("prompt_chains")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => (error ? [] : ((data ?? []) as { id: number; name: string }[]))),
  ]);

  const people = await profilesFor(
    supabase,
    pageRows.map((r) => r.user_id),
  );

  return {
    total,
    succeeded,
    failed,
    running: total - succeeded - failed,
    medianMs: median(durations),
    finished: durations.length,
    page,
    totalPages,
    rows: pageRows.map(({ images, ...r }) => {
      const img = one(images);
      return { ...r, imageUrl: img ? trustedImageUrl(img.public_url) : null };
    }),
    people,
    chains,
  };
}

/* ---- One generation request ---------------------------------------------------- */

const RESPONSE_COLUMNS =
  "id, request_id, step_order, step_name, model_id, api_model_id, attempt, status, latency_ms, input_tokens, output_tokens, prompt, response_text, error, created_at";

export type RequestCaption = CaptionRow & { score: number; upvotes: number; downvotes: number };

export type RequestDetail = {
  request: GenerationRequest;
  imageUrl: string | null;
  chain: { id: number; name: string; slug: string } | null;
  user: Profile | null;
  calls: LlmResponse[];
  captions: RequestCaption[];
  /** Why captions couldn't be listed (e.g. captions.request_id not added yet), or null. */
  captionsError: string | null;
  /** api_model_id -> configured display name. */
  modelNames: Map<string, string>;
};

/** Postgres "undefined_column": captions.request_id is added by week7-domain.sql. */
const UNDEFINED_COLUMN = "42703";

export async function loadRequest(supabase: Supabase, id: string): Promise<RequestDetail | null> {
  type Row = GenerationRequest & {
    images: EmbeddedImage;
    prompt_chains: { id: number; name: string; slug: string } | { id: number; name: string; slug: string }[] | null;
  };
  const [reqRes, calls, captionRes, models] = await Promise.all([
    supabase
      .from("generation_requests")
      .select(`${REQUEST_COLUMNS}, images(id, public_url), prompt_chains(id, name, slug)`)
      .eq("id", id)
      .maybeSingle(),
    rows<LlmResponse>(
      supabase
        .from("llm_responses")
        .select(RESPONSE_COLUMNS)
        .eq("request_id", id)
        .order("step_order")
        .order("attempt")
        .order("created_at")
        .order("id"),
    ),
    supabase
      .from("captions")
      .select("id, image_id, user_id, text, model, created_at")
      .eq("request_id", id)
      .order("created_at")
      .order("id"),
    loadModels(supabase),
  ]);
  check(reqRes.error);
  if (!reqRes.data) return null;
  const { images, prompt_chains, ...request } = reqRes.data as unknown as Row;

  let captions: RequestCaption[] = [];
  let captionsError: string | null = null;
  if (captionRes.error) {
    captionsError =
      captionRes.error.code === UNDEFINED_COLUMN || isMissingSchema(captionRes.error)
        ? "Captions aren't linked to requests yet. Run supabase/week7-domain.sql to add captions.request_id."
        : captionRes.error.message;
  } else {
    const list = (captionRes.data ?? []) as CaptionRow[];
    const scores = await scoresFor(
      supabase,
      list.map((c) => c.id),
    ).catch(() => new Map());
    captions = list.map((c) => {
      const s = scores.get(c.id);
      return { ...c, score: Number(s?.score) || 0, upvotes: Number(s?.upvotes) || 0, downvotes: Number(s?.downvotes) || 0 };
    });
  }

  const people = await profilesFor(supabase, [request.user_id]);
  const img = one(images);

  return {
    request,
    imageUrl: img ? trustedImageUrl(img.public_url) : null,
    chain: one(prompt_chains),
    user: people.get(request.user_id) ?? null,
    calls,
    captions,
    captionsError,
    modelNames: new Map(models.map((m) => [m.api_model_id, m.name])),
  };
}

/* ---- LLM responses --------------------------------------------------------------- */

export const CALL_STATUSES = ["ok", "error", "empty"] as const;
export const RESPONSES_PER_PAGE = 50;

export type ResponseFilters = {
  status: "" | LlmResponse["status"];
  /** api_model_id, or "" for every model. */
  model: string;
  /** step_order, or null for every step. */
  step: number | null;
  page: number;
};

export function parseResponseFilters(sp: SearchParams): ResponseFilters {
  const model = param(sp, "model", 100);
  const step = param(sp, "step", 4);
  return {
    status: pickEnum(param(sp, "status", 8), ["", ...CALL_STATUSES], ""),
    model: PATTERNS.apiModelId.test(model) ? model : "",
    step: /^[1-9]\d{0,3}$/.test(step) ? Number(step) : null,
    page: parsePage(param(sp, "page", 6)),
  };
}

type CallLite = Pick<
  LlmResponse,
  | "id"
  | "request_id"
  | "step_order"
  | "step_name"
  | "api_model_id"
  | "attempt"
  | "status"
  | "latency_ms"
  | "input_tokens"
  | "output_tokens"
  | "created_at"
>;

export type ResponseListRow = CallLite & { response_text: string | null; error: string | null };

export type ResponsesPageData = {
  /** Calls matching the filters. */
  total: number;
  /** Distinct requests among them. */
  requests: number;
  errors: number;
  empties: number;
  /** Mean latency of ok calls with a recorded latency. */
  avgOkLatencyMs: number | null;
  okWithLatency: number;
  /** Successful steps that needed a backup model, out of all successful steps (see fallbackCounts). */
  fellBack: number;
  okSteps: number;
  page: number;
  totalPages: number;
  rows: ResponseListRow[];
  modelOptions: { value: string; label: string }[];
  stepOptions: { value: string; label: string }[];
  modelNames: Map<string, string>;
};

export async function loadResponses(supabase: Supabase, f: ResponseFilters): Promise<ResponsesPageData> {
  const [all, models] = await Promise.all([
    allRows<CallLite>((from, to) =>
      supabase
        .from("llm_responses")
        .select(
          "id, request_id, step_order, step_name, api_model_id, attempt, status, latency_ms, input_tokens, output_tokens, created_at",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    loadModels(supabase),
  ]);

  const matches = all.filter(
    (c) =>
      (!f.status || c.status === f.status) &&
      (!f.model || c.api_model_id === f.model) &&
      (f.step === null || c.step_order === f.step),
  );

  let errors = 0;
  let empties = 0;
  let latencySum = 0;
  let okWithLatency = 0;
  for (const c of matches) {
    if (c.status === "error") errors += 1;
    else if (c.status === "empty") empties += 1;
    else if (typeof c.latency_ms === "number") {
      latencySum += c.latency_ms;
      okWithLatency += 1;
    }
  }
  const { fellBack, okSteps } = fallbackCounts(matches);

  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / RESPONSES_PER_PAGE));
  const page = Math.min(f.page, totalPages);
  const slice = matches.slice((page - 1) * RESPONSES_PER_PAGE, page * RESPONSES_PER_PAGE);

  // Response text only for the 50 rows on screen.
  const texts =
    slice.length > 0
      ? await rows<{ id: number; response_text: string | null; error: string | null }>(
          supabase
            .from("llm_responses")
            .select("id, response_text, error")
            .in(
              "id",
              slice.map((c) => c.id),
            ),
        )
      : [];
  const textById = new Map(texts.map((t) => [Number(t.id), t]));

  // Filter options: configured models first (by priority), then any other model seen in the log.
  const modelNames = new Map(models.map((m) => [m.api_model_id, m.name]));
  const modelIds = [...models.map((m) => m.api_model_id)];
  for (const id of [...new Set(all.map((c) => c.api_model_id))].sort()) if (!modelIds.includes(id)) modelIds.push(id);
  if (f.model && !modelIds.includes(f.model)) modelIds.push(f.model);

  const stepNames = new Map<number, string>();
  for (const c of all) if (!stepNames.has(c.step_order)) stepNames.set(c.step_order, c.step_name); // newest name wins
  if (f.step !== null && !stepNames.has(f.step)) stepNames.set(f.step, `Step ${f.step}`);

  return {
    total,
    requests: new Set(matches.map((c) => c.request_id)).size,
    errors,
    empties,
    avgOkLatencyMs: okWithLatency > 0 ? latencySum / okWithLatency : null,
    okWithLatency,
    fellBack,
    okSteps,
    page,
    totalPages,
    rows: slice.map((c) => ({
      ...c,
      response_text: textById.get(c.id)?.response_text ?? null,
      error: textById.get(c.id)?.error ?? null,
    })),
    modelOptions: modelIds.map((id) => ({
      value: id,
      label: modelNames.has(id) ? `${modelNames.get(id)} (${id})` : id,
    })),
    stepOptions: [...stepNames.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([order, name]) => ({ value: String(order), label: `${order} · ${name}` })),
    modelNames,
  };
}
