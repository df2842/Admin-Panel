"use server";

import { revalidatePath } from "next/cache";
import { parseId, parseRecord } from "@/components/crud/schema";
import { checkAdmin } from "@/lib/admin";
import { deleteRow, insertRow, updateRow } from "@/lib/config-data";
import type { ActionResult } from "@/lib/media";
import { DOMAIN_FIELDS, EMAIL_FIELDS } from "./fields";

/**
 * Create / update / delete the sign-in access lists (allowed sign-up domains
 * and whitelisted e-mails). Superadmins only, and RLS allows nobody else to
 * even read these tables.
 */

const fail = (error: string): ActionResult => ({ ok: false, error });
const DOMAIN_GONE = "That domain is no longer on the list. Reload the page.";
const EMAIL_GONE = "That e-mail is no longer on the list. Reload the page.";

function done(result: ActionResult): ActionResult {
  if (result.ok) revalidatePath("/access");
  return result;
}

// ---- Allowed sign-up domains -----------------------------------------------------------

export async function createDomain(input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const parsed = parseRecord(DOMAIN_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  const { domain } = parsed.values;
  return done(
    await insertRow(auth.ctx.supabase, "allowed_signup_domains", parsed.values, {
      done: `Added ${domain}.`,
      unique: `${domain} is already on the list.`,
    }),
  );
}

export async function updateDomain(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const domainId = parseId(id);
  if (domainId === null) return fail(DOMAIN_GONE);
  const parsed = parseRecord(DOMAIN_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  const { domain } = parsed.values;
  return done(
    await updateRow(auth.ctx.supabase, "allowed_signup_domains", domainId, parsed.values, {
      done: `Saved ${domain}.`,
      gone: DOMAIN_GONE,
      unique: `${domain} is already on the list.`,
    }),
  );
}

export async function deleteDomain(id: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const domainId = parseId(id);
  if (domainId === null) return fail(DOMAIN_GONE);
  return done(
    await deleteRow(auth.ctx.supabase, "allowed_signup_domains", domainId, {
      done: "Domain removed.",
      gone: DOMAIN_GONE,
    }),
  );
}

// ---- Whitelisted e-mails ----------------------------------------------------------------

export async function createEmail(input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const parsed = parseRecord(EMAIL_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  const { email } = parsed.values;
  return done(
    await insertRow(auth.ctx.supabase, "whitelisted_emails", parsed.values, {
      done: `Whitelisted ${email}.`,
      unique: `${email} is already whitelisted.`,
    }),
  );
}

export async function updateEmail(id: unknown, input: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const emailId = parseId(id);
  if (emailId === null) return fail(EMAIL_GONE);
  const parsed = parseRecord(EMAIL_FIELDS, input);
  if (!parsed.ok) return fail(parsed.error);
  const { email } = parsed.values;
  return done(
    await updateRow(auth.ctx.supabase, "whitelisted_emails", emailId, parsed.values, {
      done: `Saved ${email}.`,
      gone: EMAIL_GONE,
      unique: `${email} is already whitelisted.`,
    }),
  );
}

export async function deleteEmail(id: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  const emailId = parseId(id);
  if (emailId === null) return fail(EMAIL_GONE);
  return done(
    await deleteRow(auth.ctx.supabase, "whitelisted_emails", emailId, {
      done: "E-mail removed from the whitelist.",
      gone: EMAIL_GONE,
    }),
  );
}
