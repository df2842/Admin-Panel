import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { describeImage } from "@/lib/captions";
import { GenerationLog, type LlmCall } from "@/lib/generation-log";
import {
  DESCRIPTION_MAX,
  MAX_UPLOAD_BYTES,
  UPLOAD_EXT,
  isUuid,
  sniffImage,
  type ReplacePhotoReply,
} from "@/lib/media";
import { loadPipelineConfig } from "@/lib/pipeline-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** "Re-describe with AI" calls Gemini, which can take a few seconds. */
export const maxDuration = 60;

/** AI budget, leaving headroom inside maxDuration for storage and the update. */
const AI_BUDGET_MS = 40_000;
const GONE = "That photo no longer exists.";

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/** Storage refused the upload because of row level security (reported as a 403). */
function blockedByRls(err: { message: string; status?: number; statusCode?: string }): boolean {
  return err.status === 403 || err.statusCode === "403" || /row-level security/i.test(err.message);
}

/**
 * Replaces the image file of an existing photo, keeping its id, jokes and votes.
 * A route handler rather than a server action because server-action bodies are
 * capped at 1 MB.
 *
 * Form fields: `file` (JPEG/PNG/WebP, max 6 MB, sniffed from its bytes) and
 * optional `redescribe=1` (Gemini writes a new description from the new photo,
 * using the database pipeline config; logged as a "describe" request).
 *
 * Order: (AI description) -> upload new file (owner's folder) -> update the images row ->
 * delete the old file (best effort). The row only changes after the new file
 * is safely stored, and a failed update removes the new file again.
 * Responds with ReplacePhotoReply (200) or { error }.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const auth = await checkAdmin();
  if (!auth.ok) return error(auth.error, auth.status);
  const { supabase, user } = auth.ctx;

  const { id } = await params;
  if (!isUuid(id)) return error("Unknown photo.", 400);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 256 * 1024) return error("The photo must be 6 MB or smaller.", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Could not read the upload.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return error("No photo received.", 400);
  if (file.size > MAX_UPLOAD_BYTES) return error("The photo must be 6 MB or smaller.", 413);

  const redescribe = form.get("redescribe");
  if (redescribe !== null && redescribe !== "0" && redescribe !== "1") return error("Invalid option.", 400);
  const wantsAi = redescribe === "1";
  if (wantsAi && !process.env.GEMINI_API_KEY) {
    return error('AI is off on this server (GEMINI_API_KEY is missing). Uncheck "Re-describe with AI".', 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mediaType = sniffImage(bytes);
  if (!mediaType) return error("Use a JPEG, PNG or WebP image.", 415);

  // The current row: confirms the photo exists before anything is uploaded.
  const { data: current, error: loadError } = await supabase
    .from("images")
    .select("id, user_id, storage_path")
    .eq("id", id)
    .maybeSingle<{ id: string; user_id: string; storage_path: string }>();
  if (loadError) return error(`Could not load the photo: ${loadError.message}`, 500);
  if (!current) return error(GONE, 404);

  // A re-describe is logged as a "describe" request; a later failure marks it failed.
  let log: GenerationLog | null = null;
  const failWith = async (message: string, status: number) => {
    await log?.finish({ status: "failed", error: message });
    return error(message, status);
  };

  // Describe first, so an AI failure leaves everything untouched.
  let description: string | null = null;
  if (wantsAi) {
    const config = await loadPipelineConfig(supabase);
    const requestLog = await GenerationLog.start(supabase, {
      userId: user.id,
      kind: "describe",
      style: null,
      chainId: config.chainId,
      imageId: id,
    });
    log = requestLog;
    try {
      const described = await describeImage(bytes.toString("base64"), mediaType, {
        config,
        deadline: started + AI_BUDGET_MS,
        onCall: (call: LlmCall) => requestLog.call(call),
      });
      description = described.description.replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_MAX) || null;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "The AI could not describe this photo.";
      await requestLog.finish({ status: "failed", error: reason });
      return error(`${reason} Uncheck "Re-describe with AI" to replace the photo without a new description.`, 502);
    }
    if (!description) {
      await requestLog.finish({ status: "failed", error: "Empty description" });
      return error('The AI returned an empty description. Try again, or uncheck "Re-describe with AI".', 502);
    }
  }

  // Store the file in the owner's folder, so the owner's own delete in Caption
  // Arena removes it too. That needs the Week 7 "Superadmins upload into any
  // folder" policy; until it runs, RLS refuses and the admin's folder is used.
  const fileName = `${randomUUID()}.${UPLOAD_EXT[mediaType]}`;
  const upload = (path: string) =>
    supabase.storage.from("images").upload(path, bytes, { contentType: mediaType, upsert: false });
  let storagePath = `${current.user_id}/${fileName}`;
  let { error: uploadError } = await upload(storagePath);
  if (uploadError && current.user_id !== user.id && blockedByRls(uploadError)) {
    storagePath = `${user.id}/${fileName}`;
    ({ error: uploadError } = await upload(storagePath));
  }
  if (uploadError) return failWith(`Upload failed: ${uploadError.message}`, 500);

  // Built by Supabase, so it always points at exactly this object.
  const {
    data: { publicUrl },
  } = supabase.storage.from("images").getPublicUrl(storagePath);

  // Only replace the file we read above: if another admin swapped it meanwhile, stop.
  const { data: updated, error: updateError } = await supabase
    .from("images")
    .update({ storage_path: storagePath, public_url: publicUrl, ...(description ? { description } : {}) })
    .eq("id", id)
    .eq("storage_path", current.storage_path)
    .select("id");
  if (updateError || !updated?.length) {
    await supabase.storage.from("images").remove([storagePath]);
    if (updateError) return failWith(`Could not save the photo: ${updateError.message}`, 500);
    return failWith("This photo was changed or deleted while you were uploading. Reload the page and try again.", 409);
  }
  // image_id was set by start(); the request only needs its status.
  await log?.finish({ status: "succeeded" });

  // Delete the old file, unless another photo row still points at it.
  const oldPath = current.storage_path;
  let oldFileRemoved = false;
  if (oldPath && oldPath !== storagePath && !oldPath.includes("..")) {
    const { count, error: refError } = await supabase
      .from("images")
      .select("id", { count: "exact", head: true })
      .eq("storage_path", oldPath);
    if (!refError && count === 0) {
      const { data: removed, error: removeError } = await supabase.storage.from("images").remove([oldPath]);
      oldFileRemoved = !removeError && (removed?.length ?? 0) > 0;
    }
    if (!oldFileRemoved) console.error("[media] photo replaced but the old file was not removed", oldPath);
  }

  revalidatePath("/media");
  revalidatePath(`/media/${id}`);
  revalidatePath("/");
  revalidatePath("/votes");
  revalidatePath("/users");

  const reply: ReplacePhotoReply = { ok: true, publicUrl, described: !!description, oldFileRemoved };
  return NextResponse.json(reply);
}
