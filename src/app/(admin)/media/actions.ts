"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin, type Supabase } from "@/lib/admin";
import { writeCaptions } from "@/lib/captions";
import { JOKE_STYLES, type JokeStyle } from "@/lib/joke-styles";
import {
  AI_BATCH,
  CAPTION_MAX,
  DESCRIPTION_MAX,
  MANUAL_MODEL,
  MAX_JOKES_PER_PHOTO,
  cleanText,
  isUuid,
  type ActionResult,
} from "@/lib/media";

/**
 * Admin mutations for photos and their jokes. Every action re-checks that the
 * caller is a superadmin and validates its input; row level security enforces
 * the same rules again inside the database.
 */

/** Refresh every page that shows photos, jokes or their totals. */
function refreshMedia(imageId?: string) {
  revalidatePath("/media");
  if (imageId) revalidatePath(`/media/${imageId}`);
  revalidatePath("/");
  revalidatePath("/votes");
  revalidatePath("/users");
}

const fail = (error: string): ActionResult => ({ ok: false, error });

/** Updates take effect only on rows RLS lets us see; 0 rows means gone or blocked. */
const GONE_PHOTO = "That photo no longer exists.";
const GONE_JOKE = "That joke no longer exists.";

async function countJokes(supabase: Supabase, imageId: string): Promise<number> {
  const { count, error } = await supabase
    .from("captions")
    .select("id", { count: "exact", head: true })
    .eq("image_id", imageId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function updateDescription(imageId: unknown, description: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(imageId)) return fail("Unknown photo.");
  const text = cleanText(description, DESCRIPTION_MAX);
  if (!text) return fail(`The description must be 1–${DESCRIPTION_MAX} characters.`);

  const { data, error } = await auth.ctx.supabase
    .from("images")
    .update({ description: text })
    .eq("id", imageId)
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail(GONE_PHOTO);

  refreshMedia(imageId);
  return { ok: true, message: "Description saved." };
}

export async function addCaption(imageId: unknown, text: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(imageId)) return fail("Unknown photo.");
  const clean = cleanText(text, CAPTION_MAX);
  if (!clean) return fail(`A joke must be 1–${CAPTION_MAX} characters.`);

  const { supabase, user } = auth.ctx;
  try {
    if ((await countJokes(supabase, imageId)) >= MAX_JOKES_PER_PHOTO) {
      return fail(`This photo already has ${MAX_JOKES_PER_PHOTO} jokes. Delete one first.`);
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not count jokes.");
  }

  const { error } = await supabase
    .from("captions")
    .insert({ image_id: imageId, user_id: user.id, text: clean, model: MANUAL_MODEL });
  if (error) return fail(error.code === "23503" ? GONE_PHOTO : error.message);

  refreshMedia(imageId);
  return { ok: true, message: "Joke added." };
}

export async function updateCaption(captionId: unknown, text: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(captionId)) return fail("Unknown joke.");
  const clean = cleanText(text, CAPTION_MAX);
  if (!clean) return fail(`A joke must be 1–${CAPTION_MAX} characters.`);

  const { data, error } = await auth.ctx.supabase
    .from("captions")
    .update({ text: clean })
    .eq("id", captionId)
    .select("image_id");
  if (error) return fail(error.message);
  if (!data?.length) return fail(GONE_JOKE);

  refreshMedia(data[0].image_id as string);
  return { ok: true, message: "Joke saved." };
}

export async function deleteCaption(captionId: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(captionId)) return fail("Unknown joke.");

  const { data, error } = await auth.ctx.supabase.from("captions").delete().eq("id", captionId).select("image_id");
  if (error) return fail(error.message);
  if (!data?.length) return fail(GONE_JOKE);

  refreshMedia(data[0].image_id as string);
  return { ok: true, message: "Joke deleted." };
}

/**
 * Re-runs the second link of the prompt chain (description -> jokes) in the
 * chosen style, telling the model which jokes already exist.
 */
export async function generateCaptions(imageId: unknown, style: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(imageId)) return fail("Unknown photo.");
  if (typeof style !== "string" || !Object.hasOwn(JOKE_STYLES, style)) return fail("Pick a joke style.");
  if (!process.env.GEMINI_API_KEY) return fail("AI generation is off: GEMINI_API_KEY is not set on the server.");

  const { supabase, user } = auth.ctx;
  const { data: image, error } = await supabase
    .from("images")
    .select("id, description, captions(text)")
    .eq("id", imageId)
    .maybeSingle<{ id: string; description: string; captions: { text: string }[] | null }>();
  if (error) return fail(error.message);
  if (!image) return fail(GONE_PHOTO);
  if (!image.description.trim()) return fail("Add a description first; the AI writes jokes from it.");

  const existing = (image.captions ?? []).map((c) => c.text);
  const room = MAX_JOKES_PER_PHOTO - existing.length;
  if (room <= 0) return fail(`This photo already has ${MAX_JOKES_PER_PHOTO} jokes. Delete some first.`);

  let written: { captions: string[]; model: string };
  try {
    written = await writeCaptions(image.description, {
      style: style as JokeStyle,
      count: Math.min(AI_BATCH, room),
      avoid: existing,
      deadline: Date.now() + 40_000,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "The AI could not write jokes right now.");
  }

  const { data: inserted, error: insertError } = await supabase
    .from("captions")
    .insert(written.captions.map((text) => ({ image_id: image.id, user_id: user.id, text, model: written.model })))
    .select("id");
  if (insertError) return fail(insertError.code === "23503" ? GONE_PHOTO : insertError.message);

  refreshMedia(image.id);
  const n = inserted?.length ?? written.captions.length;
  return { ok: true, message: `Added ${n} new joke${n === 1 ? "" : "s"}.` };
}

/**
 * Deletes the photo row (its jokes and votes cascade) and then its file in
 * storage, then sends the admin back to the media list.
 */
export async function deleteImage(imageId: unknown): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(imageId)) return fail("Unknown photo.");
  const { supabase } = auth.ctx;

  const { data: deleted, error } = await supabase.from("images").delete().eq("id", imageId).select("storage_path");
  if (error) return fail(error.message);
  if (!deleted?.length) return fail(GONE_PHOTO);

  // Row first, file second: a leftover file is invisible, a row without a file is a broken photo.
  const path = deleted[0].storage_path as string;
  const { data: removed, error: storageError } = await supabase.storage.from("images").remove([path]);
  const fileGone = !storageError && (removed?.length ?? 0) > 0;
  if (!fileGone) console.error("[media] photo row deleted but file was not removed", path, storageError?.message);

  refreshMedia(imageId);
  redirect(`/media?deleted=${fileGone ? "1" : "file"}`);
}
