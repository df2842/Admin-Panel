import type { DbValues } from "@/components/crud/schema";
import type { Supabase } from "@/lib/admin";
import { profilesFor } from "@/lib/data";
import type {
  AiGenerationExample,
  AllowedSignupDomain,
  LlmModel,
  LlmProvider,
  PromptChain,
  PromptChainMix,
  Term,
  WhitelistedEmail,
} from "@/lib/domain";
import type { ActionResult } from "@/lib/media";
import { MIGRATIONS, isMissingSchema } from "@/lib/setup";
import type { Profile } from "@/lib/types";

/**
 * Data for the AI-configuration and sign-in access screens (/terms,
 * /examples, /llm, /access): loaders that never throw, plus the insert /
 * update / delete helpers their server actions share. Every query runs with
 * the signed-in superadmin's session, so Row Level Security has the final say.
 */

type DbError = { message: string; code?: string | null };

/** A page's data, or why it couldn't load (`missing` = migration not run yet). */
export type Loaded<T> = { ok: true; data: T } | { ok: false; missing: boolean; error: string };

/**
 * Caption Arena only calls models whose provider has this slug (see
 * Hello-World/src/lib/pipeline-config.ts), in priority order.
 */
export const APP_PROVIDER_SLUG = "google";

/** The prompt chain Caption Arena runs (while active); examples for other chains are never sent. */
export const APP_CHAIN_SLUG = "describe-then-joke";

/** Caption Arena's prompt caps: the first 12 active terms (A to Z) and the 4 newest usable active examples. */
export const APP_MAX_TERMS = 12;
export const APP_MAX_EXAMPLES = 4;

/** Free-text cap for ai_generation_examples.flavor (no SQL check; mix flavors are ≤ 40). */
export const FLAVOR_MAX = 40;

// ---- Reading ------------------------------------------------------------------------

async function readAll<T>(
  supabase: Supabase,
  table: string,
  columns: string,
  order: { column: string; ascending?: boolean }[],
): Promise<{ rows: T[]; error: DbError | null }> {
  const rows: T[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    let query = supabase.from(table).select(columns);
    for (const o of order) query = query.order(o.column, { ascending: o.ascending ?? true });
    const { data, error } = await query.range(from, from + 999);
    if (error) return { rows, error };
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return { rows, error: null };
}

/** The first failure among several queries, with "missing table" taking priority. */
function failure(...errors: (DbError | null)[]): { ok: false; missing: boolean; error: string } | null {
  const failed = errors.filter((e): e is DbError => e !== null);
  if (failed.length === 0) return null;
  if (failed.some((e) => isMissingSchema(e))) return { ok: false, missing: true, error: "" };
  return { ok: false, missing: false, error: failed[0].message };
}

const byText =
  <T>(pick: (row: T) => string) =>
  (a: T, b: T) =>
    pick(a).localeCompare(pick(b), "en", { sensitivity: "base", numeric: true });

const TERM_COLUMNS = "id, term, definition, example, is_active, created_at, updated_at";
const EXAMPLE_COLUMNS = "id, chain_id, image_description, caption, flavor, is_active, created_at, updated_at";
const CHAIN_COLUMNS = "id, slug, name, description, is_active, created_at, updated_at";
const MIX_COLUMNS = "id, chain_id, flavor, label, instruction, weight, sort_order, created_at, updated_at";
const PROVIDER_COLUMNS = "id, name, slug, api_base_url, docs_url, is_active, created_at, updated_at";
const MODEL_COLUMNS =
  "id, provider_id, name, api_model_id, priority, supports_vision, is_active, notes, created_at, updated_at";
const ACCESS_DOMAIN_COLUMNS = "id, domain, note, created_by, created_at, updated_at";
const ACCESS_EMAIL_COLUMNS = "id, email, note, created_by, created_at, updated_at";

/** Every term, A to Z. */
export async function loadTerms(supabase: Supabase): Promise<Loaded<Term[]>> {
  const terms = await readAll<Term>(supabase, "terms", TERM_COLUMNS, [{ column: "term" }, { column: "id" }]);
  const failed = failure(terms.error);
  if (failed) return failed;
  // Same order as Caption Arena (term, then id), so "Not sent (over 12)" marks the right rows.
  return { ok: true, data: terms.rows };
}

export type ExamplesData = {
  /** Newest first. */
  examples: AiGenerationExample[];
  chains: PromptChain[];
  /** Humor flavors of every chain's mix (for the flavor suggestions). */
  mix: PromptChainMix[];
};

export async function loadExamples(supabase: Supabase): Promise<Loaded<ExamplesData>> {
  const [examples, chains, mix] = await Promise.all([
    readAll<AiGenerationExample>(supabase, "ai_generation_examples", EXAMPLE_COLUMNS, [
      { column: "created_at", ascending: false },
      { column: "id", ascending: false },
    ]),
    readAll<PromptChain>(supabase, "prompt_chains", CHAIN_COLUMNS, [{ column: "name" }, { column: "id" }]),
    readAll<PromptChainMix>(supabase, "prompt_chain_mix", MIX_COLUMNS, [{ column: "sort_order" }, { column: "id" }]),
  ]);
  const failed = failure(examples.error, chains.error, mix.error);
  if (failed) return failed;
  return { ok: true, data: { examples: examples.rows, chains: chains.rows, mix: mix.rows } };
}

export type LlmData = {
  /** A to Z. */
  providers: LlmProvider[];
  /** In the order Caption Arena tries them: priority, then id. */
  models: LlmModel[];
};

export async function loadLlm(supabase: Supabase): Promise<Loaded<LlmData>> {
  const [providers, models] = await Promise.all([
    readAll<LlmProvider>(supabase, "llm_providers", PROVIDER_COLUMNS, [{ column: "name" }, { column: "id" }]),
    readAll<LlmModel>(supabase, "llm_models", MODEL_COLUMNS, [{ column: "priority" }, { column: "id" }]),
  ]);
  const failed = failure(providers.error, models.error);
  if (failed) return failed;
  return {
    ok: true,
    data: {
      providers: providers.rows.toSorted(byText((p) => p.name)),
      models: models.rows.toSorted((a, b) => a.priority - b.priority || a.id - b.id),
    },
  };
}

export type AccessData = {
  domains: AllowedSignupDomain[];
  emails: WhitelistedEmail[];
  /** Who added each entry (by created_by). */
  people: Map<string, Profile>;
  /** Superadmin e-mails (always allowed), for the "who can sign in" checker. */
  superadminEmails: string[];
};

export async function loadAccess(supabase: Supabase): Promise<Loaded<AccessData>> {
  const [domains, emails, admins] = await Promise.all([
    readAll<AllowedSignupDomain>(supabase, "allowed_signup_domains", ACCESS_DOMAIN_COLUMNS, [{ column: "domain" }]),
    readAll<WhitelistedEmail>(supabase, "whitelisted_emails", ACCESS_EMAIL_COLUMNS, [{ column: "email" }]),
    supabase.from("profiles").select("email").eq("is_superadmin", true).limit(500),
  ]);
  const failed = failure(domains.error, emails.error);
  if (failed) return failed;

  const creators = [...domains.rows, ...emails.rows].map((r) => r.created_by).filter((id): id is string => !!id);
  const people = await profilesFor(supabase, creators);
  // Optional: if profiles can't be read the checker simply doesn't know the superadmins.
  const superadminEmails = admins.error
    ? []
    : ((admins.data ?? []) as { email: string | null }[]).map((p) => p.email?.toLowerCase() ?? "").filter(Boolean);

  return { ok: true, data: { domains: domains.rows, emails: emails.rows, people, superadminEmails } };
}

// ---- Filtering helpers for list pages ------------------------------------------------

export const STATUS_FILTERS = ["", "active", "off"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function matchesStatus(status: StatusFilter, active: boolean): boolean {
  return status === "" || (status === "active" ? active : !active);
}

/** Case-insensitive "any of these texts contains q". */
export function matchesQuery(q: string, ...texts: (string | null | undefined)[]): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return texts.some((t) => t?.toLowerCase().includes(needle));
}

// ---- Writing ----------------------------------------------------------------------------

export type ConfigTable =
  "terms" | "ai_generation_examples" | "llm_providers" | "llm_models" | "allowed_signup_domains" | "whitelisted_emails";

/** Messages for one mutation: success text plus friendly versions of the usual failures. */
export type DbMessages = {
  done: string;
  /** No row matched (deleted meanwhile, or hidden by RLS). */
  gone?: string;
  /** 23505 unique_violation. */
  unique?: string;
  /** 23503 foreign_key_violation, or 23001 restrict_violation (PG 18+ for ON DELETE RESTRICT). */
  fk?: string;
};

export function friendlyDbError(error: DbError, messages: Partial<DbMessages> = {}): string {
  if (isMissingSchema(error)) {
    return `This table doesn't exist yet. Run ${MIGRATIONS.week7} in the Supabase SQL Editor first.`;
  }
  switch (error.code) {
    case "23505":
      return messages.unique ?? "That value is already in use.";
    case "23503":
    case "23001":
      return messages.fk ?? "A related record is missing or still in use.";
    case "23514":
      return "The database rejected one of the values. Check the fields and try again.";
    case "23502":
      return "A required field is missing.";
    case "22001":
      return "One of the values is too long.";
    case "22P02":
    case "22003":
      return "One of the values has the wrong format.";
    case "42501":
      return "The database refused this change. Only superadmins can edit this.";
    default:
      return error.message;
  }
}

const fail = (error: string): ActionResult => ({ ok: false, error });
const GONE = "That record no longer exists. Reload the page.";

export async function insertRow(
  supabase: Supabase,
  table: ConfigTable,
  values: DbValues,
  messages: DbMessages,
): Promise<ActionResult> {
  const { error } = await supabase.from(table).insert(values);
  if (error) return fail(friendlyDbError(error, messages));
  return { ok: true, message: messages.done };
}

export async function updateRow(
  supabase: Supabase,
  table: ConfigTable,
  id: number,
  values: DbValues,
  messages: DbMessages,
): Promise<ActionResult> {
  const { data, error } = await supabase.from(table).update(values).eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error, messages));
  if (!data?.length) return fail(messages.gone ?? GONE);
  return { ok: true, message: messages.done };
}

export async function deleteRow(
  supabase: Supabase,
  table: ConfigTable,
  id: number,
  messages: DbMessages,
): Promise<ActionResult> {
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error, messages));
  if (!data?.length) return fail(messages.gone ?? GONE);
  return { ok: true, message: messages.done };
}
