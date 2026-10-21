"use server";

import { revalidatePath } from "next/cache";
import { parseId, parseRecord } from "@/components/crud/schema";
import { checkAdmin } from "@/lib/admin";
import { deleteRow, insertRow, updateRow } from "@/lib/config-data";
import type { ActionResult } from "@/lib/media";
import { EXAMPLE_FIELDS } from "./fields";

/**
 * Create / update / delete AI generation examples (few-shot examples for the
 * joke-writing step). Superadmins only; inputs validated with the form's specs.
 */

const fail = (error: string): ActionResult => ({ ok: false, error });
const GONE = "That example no longer exists. Reload the page.";
const UNKNOWN = "Unknown example. Reload the page.";
const NO_CHAIN = "That prompt chain no longer exists. Pick another one or “All chains”.";

function done(result: ActionResult): ActionResult {
  if (result.ok) revalidatePath("/examples");
  return result;
}

export async function createExample(input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const parsed = parseRecord(EXAMPLE_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  return done(
    await insertRow(auth.ctx.supabase, "ai_generation_examples", parsed.values, {
      done: "Example added.",
      fk: NO_CHAIN,
    }),
  );
}

export async function updateExample(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const exampleId = parseId(id);
  if (exampleId === null) return fail(UNKNOWN);
  const parsed = parseRecord(EXAMPLE_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  return done(
    await updateRow(auth.ctx.supabase, "ai_generation_examples", exampleId, parsed.values, {
      done: "Example saved.",
      gone: GONE,
      fk: NO_CHAIN,
    }),
  );
}

export async function setExampleActive(id: unknown, active: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const exampleId = parseId(id);
  if (exampleId === null) return fail(UNKNOWN);
  if (typeof active !== "boolean") return fail("Choose on or off.");
  return done(
    await updateRow(
      auth.ctx.supabase,
      "ai_generation_examples",
      exampleId,
      { is_active: active },
      {
        done: active ? "Turned on: the joke step can see it." : "Turned off: the joke step won't see it.",
        gone: GONE,
      },
    ),
  );
}

export async function deleteExample(id: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const exampleId = parseId(id);
  if (exampleId === null) return fail(UNKNOWN);
  return done(
    await deleteRow(auth.ctx.supabase, "ai_generation_examples", exampleId, { done: "Example deleted.", gone: GONE }),
  );
}
