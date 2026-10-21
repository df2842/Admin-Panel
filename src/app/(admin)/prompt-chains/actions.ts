"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin } from "@/lib/admin";
import type { ActionResult } from "@/lib/media";
import { isMissingSchema } from "@/lib/setup";
import { isMixWeight, MIX_WEIGHT_MAX, MIX_WEIGHT_MIN } from "@/components/pipeline/pipeline-utils";

/**
 * The only write on the AI pipeline screens: a prompt chain's humor-flavor
 * mix weights. Prompt chains and steps themselves are read-only here (RLS
 * only lets superadmins UPDATE prompt_chain_mix), and only `weight` changes.
 */

const fail = (error: string): ActionResult => ({ ok: false, error });

const WEIGHT_RULE = `Weights must be whole numbers from ${MIX_WEIGHT_MIN} to ${MIX_WEIGHT_MAX}.`;
/** A Mixed bag batch with every weight at 0 would have no flavors to draw from. */
const NEED_POSITIVE = "At least one flavor needs a weight above 0.";
const MAX_CHANGES = 100;

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function friendly(error: { code?: string | null; message: string }): string {
  if (isMissingSchema(error)) return "The prompt chain tables don't exist yet. Run supabase/week7-domain.sql first.";
  switch (error.code) {
    case "23514":
      return WEIGHT_RULE;
    case "23503":
      return "That prompt chain no longer exists.";
    case "23505":
      return "That flavor already exists on this chain.";
    case "42501":
      return "Only superadmins can change the mix.";
    default:
      return error.message || "The database refused the change.";
  }
}

/**
 * Saves new weights for some of a chain's flavors.
 * `changes` = [{ id: prompt_chain_mix.id, weight: 0-100 }, ...] (only the rows that changed).
 */
export async function updateMixWeights(chainId: unknown, changes: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  if (!isId(chainId)) return fail("Unknown prompt chain.");
  if (!Array.isArray(changes) || changes.length === 0) return fail("There are no weight changes to save.");
  if (changes.length > MAX_CHANGES) return fail("Too many flavors in one save.");

  const next = new Map<number, number>();
  for (const change of changes) {
    if (!change || typeof change !== "object") return fail("Invalid weights.");
    const { id, weight } = change as { id?: unknown; weight?: unknown };
    if (!isId(id)) return fail("Unknown flavor.");
    if (!isMixWeight(weight)) return fail(WEIGHT_RULE);
    if (next.has(id)) return fail("Each flavor can only be listed once.");
    next.set(id, weight);
  }

  const { supabase } = auth.ctx;
  const { data, error } = await supabase.from("prompt_chain_mix").select("id, label, weight").eq("chain_id", chainId);
  if (error) return fail(friendly(error));
  const current = ((data ?? []) as { id: number; label: string; weight: number }[]).map((r) => ({
    id: Number(r.id),
    label: r.label,
    weight: Number(r.weight),
  }));
  if (current.length === 0) return fail("That prompt chain has no flavors, or it no longer exists.");

  const byId = new Map(current.map((r) => [r.id, r]));
  for (const id of next.keys()) {
    if (!byId.has(id)) return fail("A flavor in this form no longer belongs to this chain. Reload the page and try again.");
  }
  // Check the whole chain as it will be after the save (rows not in this save keep their weight).
  if (!current.some((r) => (next.get(r.id) ?? r.weight) > 0)) return fail(NEED_POSITIVE);

  const updates = [...next].filter(([id, weight]) => byId.get(id)!.weight !== weight);
  if (updates.length === 0) return { ok: true, message: "Nothing changed; the weights were already saved." };

  const results = await Promise.all(
    updates.map(async ([id, weight]) => {
      const res = await supabase
        .from("prompt_chain_mix")
        .update({ weight })
        .eq("id", id)
        .eq("chain_id", chainId)
        .select("id");
      if (res.error) return { id, error: friendly(res.error) };
      // RLS hides rows it won't let us update, so 0 rows means blocked or deleted.
      if (!res.data?.length) return { id, error: "The database didn't allow this update." };
      return { id, error: null };
    }),
  );

  revalidatePath(`/prompt-chains/${chainId}`);
  revalidatePath("/prompt-chains");

  const failed = results.filter((r) => r.error);
  if (failed.length === updates.length) return fail(failed[0].error!);
  if (failed.length > 0) {
    const names = failed.map((r) => byId.get(r.id)?.label ?? `#${r.id}`).join(", ");
    return fail(
      `Saved ${updates.length - failed.length} of ${updates.length}. Not saved: ${names} (${failed[0].error}) Reload to see the current weights.`,
    );
  }
  return { ok: true, message: `Saved ${updates.length} weight${updates.length === 1 ? "" : "s"}.` };
}
