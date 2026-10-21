"use server";

import { revalidatePath } from "next/cache";
import { parseId, parseRecord } from "@/components/crud/schema";
import { checkAdmin } from "@/lib/admin";
import { deleteRow, insertRow, updateRow } from "@/lib/config-data";
import type { ActionResult } from "@/lib/media";
import { TERM_FIELDS } from "./fields";

/**
 * Create / update / delete comedy terms. Each action re-checks the caller is
 * a superadmin and validates with the same field specs as the form.
 */

const fail = (error: string): ActionResult => ({ ok: false, error });
const GONE = "That term no longer exists. Reload the page.";
const UNKNOWN = "Unknown term. Reload the page.";

function done(result: ActionResult): ActionResult {
  if (result.ok) revalidatePath("/terms");
  return result;
}

export async function createTerm(input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const parsed = parseRecord(TERM_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  const term = parsed.values.term;
  return done(
    await insertRow(auth.ctx.supabase, "terms", parsed.values, {
      done: `Added “${term}”.`,
      unique: `A term called “${term}” already exists.`,
    }),
  );
}

export async function updateTerm(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const termId = parseId(id);
  if (termId === null) return fail(UNKNOWN);
  const parsed = parseRecord(TERM_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  const term = parsed.values.term;
  return done(
    await updateRow(auth.ctx.supabase, "terms", termId, parsed.values, {
      done: `Saved “${term}”.`,
      gone: GONE,
      unique: `Another term is already called “${term}”.`,
    }),
  );
}

export async function setTermActive(id: unknown, active: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const termId = parseId(id);
  if (termId === null) return fail(UNKNOWN);
  if (typeof active !== "boolean") return fail("Choose on or off.");
  return done(
    await updateRow(
      auth.ctx.supabase,
      "terms",
      termId,
      { is_active: active },
      {
        done: active ? "Turned on: the joke step can use it." : "Turned off: the joke step won't see it.",
        gone: GONE,
      },
    ),
  );
}

export async function deleteTerm(id: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const termId = parseId(id);
  if (termId === null) return fail(UNKNOWN);
  return done(await deleteRow(auth.ctx.supabase, "terms", termId, { done: "Term deleted.", gone: GONE }));
}
