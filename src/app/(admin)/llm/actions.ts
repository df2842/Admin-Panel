"use server";

import { revalidatePath } from "next/cache";
import { parseId, parseRecord } from "@/components/crud/schema";
import { checkAdmin } from "@/lib/admin";
import { deleteRow, insertRow, updateRow } from "@/lib/config-data";
import type { ActionResult } from "@/lib/media";
import { MODEL_FIELDS, PROVIDER_FIELDS } from "./fields";

/**
 * Create / update / delete LLM providers and models. Superadmins only;
 * inputs validated with the same specs as the forms. The database blocks
 * deleting a provider that still has models (foreign key).
 */

const fail = (error: string): ActionResult => ({ ok: false, error });
const PROVIDER_GONE = "That provider no longer exists. Reload the page.";
const MODEL_GONE = "That model no longer exists. Reload the page.";
const NO_PROVIDER = "That provider no longer exists. Pick another one.";

function done(result: ActionResult): ActionResult {
  if (result.ok) revalidatePath("/llm");
  return result;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---- Providers ----------------------------------------------------------------------

export async function createProvider(input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const parsed = parseRecord(PROVIDER_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  const { name, slug } = parsed.values;
  return done(
    await insertRow(auth.ctx.supabase, "llm_providers", parsed.values, {
      done: `Added “${name}”.`,
      unique: `Another provider already uses the slug “${slug}”.`,
    }),
  );
}

export async function updateProvider(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const providerId = parseId(id);
  if (providerId === null) return fail(PROVIDER_GONE);
  const parsed = parseRecord(PROVIDER_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  const { name, slug } = parsed.values;
  return done(
    await updateRow(auth.ctx.supabase, "llm_providers", providerId, parsed.values, {
      done: `Saved “${name}”.`,
      gone: PROVIDER_GONE,
      unique: `Another provider already uses the slug “${slug}”.`,
    }),
  );
}

export async function setProviderActive(id: unknown, active: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const providerId = parseId(id);
  if (providerId === null) return fail(PROVIDER_GONE);
  if (typeof active !== "boolean") return fail("Choose on or off.");
  return done(
    await updateRow(
      auth.ctx.supabase,
      "llm_providers",
      providerId,
      { is_active: active },
      {
        done: active ? "Provider on: its active models can run." : "Provider off: all its models are skipped.",
        gone: PROVIDER_GONE,
      },
    ),
  );
}

export async function deleteProvider(id: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const providerId = parseId(id);
  if (providerId === null) return fail(PROVIDER_GONE);
  const { supabase } = auth.ctx;

  // Only for a precise message; the foreign key is what actually blocks the delete.
  const { count } = await supabase
    .from("llm_models")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId);
  const models = count ? plural(count, "model") : "models";

  return done(
    await deleteRow(supabase, "llm_providers", providerId, {
      done: "Provider deleted.",
      gone: PROVIDER_GONE,
      fk: `Can't delete this provider: it still has ${models}. Delete those models or move them to another provider first.`,
    }),
  );
}

// ---- Models -------------------------------------------------------------------------

export async function createModel(input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const parsed = parseRecord(MODEL_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  const { name, api_model_id } = parsed.values;
  return done(
    await insertRow(auth.ctx.supabase, "llm_models", parsed.values, {
      done: `Added “${name}”.`,
      unique: `Another model already uses the API model ID “${api_model_id}”.`,
      fk: NO_PROVIDER,
    }),
  );
}

export async function updateModel(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const modelId = parseId(id);
  if (modelId === null) return fail(MODEL_GONE);
  const parsed = parseRecord(MODEL_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  const { name, api_model_id } = parsed.values;
  return done(
    await updateRow(auth.ctx.supabase, "llm_models", modelId, parsed.values, {
      done: `Saved “${name}”.`,
      gone: MODEL_GONE,
      unique: `Another model already uses the API model ID “${api_model_id}”.`,
      fk: NO_PROVIDER,
    }),
  );
}

export async function setModelActive(id: unknown, active: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const modelId = parseId(id);
  if (modelId === null) return fail(MODEL_GONE);
  if (typeof active !== "boolean") return fail("Choose on or off.");
  return done(
    await updateRow(
      auth.ctx.supabase,
      "llm_models",
      modelId,
      { is_active: active },
      {
        done: active ? "Model on: it's back in the fallback order." : "Model off: Caption Arena skips it.",
        gone: MODEL_GONE,
      },
    ),
  );
}

export async function deleteModel(id: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const modelId = parseId(id);
  if (modelId === null) return fail(MODEL_GONE);
  // llm_responses.model_id is "on delete set null", so logged calls keep their api_model_id.
  return done(await deleteRow(auth.ctx.supabase, "llm_models", modelId, { done: "Model deleted.", gone: MODEL_GONE }));
}
