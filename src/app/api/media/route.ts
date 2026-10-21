import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { describeImage, writeCaptions } from "@/lib/captions";
import { GenerationLog, type LlmCall } from "@/lib/generation-log";
import { JOKE_STYLES, type JokeStyle } from "@/lib/joke-styles";
import {
  AI_BATCH,
  CAPTION_MAX,
  DESCRIPTION_MAX,
  MANUAL_MODEL,
  MAX_MANUAL_JOKES,
  MAX_UPLOAD_BYTES,
  UPLOAD_EXT,
  cleanText,
  sniffImage,
} from "@/lib/media";
import { loadPipelineConfig } from "@/lib/pipeline-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AI budget, leaving headroom inside maxDuration for storage, inserts and rollback. */
const AI_BUDGET_MS = 42_000;

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/**
 * Creates a photo for the admin panel.
 *   mode=ai:     Gemini describes the photo, then writes jokes in `style`,
 *                using the database pipeline config; logged as an "upload"
 *                generation request (when the Week 7 tables exist).
 *   mode=manual: uses `description` and up to 6 `caption` fields from the form.
 * Uploads to storage under the admin's own folder, inserts the images row and
 * its captions, and rolls everything back if any step fails.
 * Responds with { id } (201) or { error }.
 */
export async function POST(request: NextRequest) {
  const started = Date.now();
  const auth = await checkAdmin();
  if (!auth.ok) return error(auth.error, auth.status);
  const { supabase, user } = auth.ctx;

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

  const mode = form.get("mode");
  if (mode !== "ai" && mode !== "manual") return error("Choose AI or manual mode.", 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const mediaType = sniffImage(bytes);
  if (!mediaType) return error("Use a JPEG, PNG or WebP image.", 415);

  let description: string;
  let captions: string[];
  let model: string;
  /** The AI run's log (mode=ai only). */
  let log: GenerationLog | null = null;

  if (mode === "ai") {
    if (!process.env.GEMINI_API_KEY) {
      return error("AI is off on this server (GEMINI_API_KEY is missing). Use manual mode.", 400);
    }
    const style = form.get("style");
    if (typeof style !== "string" || !Object.hasOwn(JOKE_STYLES, style)) return error("Pick a joke style.", 400);

    // Same pipeline as Caption Arena: models, prompts, mix, terms and examples
    // come from the database, and every model call is logged.
    const config = await loadPipelineConfig(supabase);
    const requestLog = await GenerationLog.start(supabase, {
      userId: user.id,
      kind: "upload",
      style: style as JokeStyle,
      chainId: config.chainId,
    });
    log = requestLog;
    const run = { config, deadline: started + AI_BUDGET_MS, onCall: (call: LlmCall) => requestLog.call(call) };
    try {
      const described = await describeImage(bytes.toString("base64"), mediaType, run);
      const written = await writeCaptions(described.description, {
        ...run,
        style: style as JokeStyle,
        count: AI_BATCH,
      });
      description = described.description.slice(0, DESCRIPTION_MAX);
      captions = written.captions.map((c) => c.slice(0, CAPTION_MAX));
      model = written.model;
    } catch (err) {
      const message = err instanceof Error ? err.message : "The AI could not process this photo.";
      await requestLog.finish({ status: "failed", error: message });
      return error(message, 502);
    }
  } else {
    const cleanDescription = cleanText(form.get("description"), DESCRIPTION_MAX);
    if (!cleanDescription) return error(`Add a description (1–${DESCRIPTION_MAX} characters).`, 400);
    description = cleanDescription;

    const raw = form.getAll("caption");
    if (raw.length > MAX_MANUAL_JOKES) return error(`Add at most ${MAX_MANUAL_JOKES} jokes.`, 400);
    const seen = new Set<string>();
    captions = [];
    for (const value of raw) {
      if (typeof value !== "string") return error("Jokes must be text.", 400);
      if (!value.trim()) continue; // blank lines are fine, just skipped
      const text = cleanText(value, CAPTION_MAX);
      if (!text) return error(`Each joke must be 1–${CAPTION_MAX} characters.`, 400);
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      captions.push(text);
    }
    model = MANUAL_MODEL;
  }

  // ---- Save: storage -> images row -> captions, with rollback ---------------
  const storagePath = `${user.id}/${randomUUID()}.${UPLOAD_EXT[mediaType]}`;
  const requestId = log?.requestId ?? null;
  let uploaded = false;
  let imageId: string | null = null;

  try {
    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(storagePath, bytes, { contentType: mediaType, upsert: false });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    uploaded = true;

    const {
      data: { publicUrl },
    } = supabase.storage.from("images").getPublicUrl(storagePath);

    const { data: image, error: imageError } = await supabase
      .from("images")
      .insert({ user_id: user.id, storage_path: storagePath, public_url: publicUrl, description })
      .select("id")
      .single<{ id: string }>();
    if (imageError) throw new Error(`Could not save the photo: ${imageError.message}`);
    imageId = image.id;

    if (captions.length > 0) {
      const { error: captionError } = await supabase.from("captions").insert(
        captions.map((text) => ({
          image_id: image.id,
          user_id: user.id,
          text,
          model,
          ...(requestId ? { request_id: requestId } : {}),
        })),
      );
      if (captionError) throw new Error(`Could not save the jokes: ${captionError.message}`);
    }
  } catch (err) {
    // Roll back anything half-saved so the app never shows a broken photo.
    if (imageId) await supabase.from("images").delete().eq("id", imageId);
    if (uploaded) await supabase.storage.from("images").remove([storagePath]);
    const message = err instanceof Error ? err.message : "Could not save the photo.";
    await log?.finish({ status: "failed", error: message });
    return error(message, 500);
  }

  await log?.finish({ status: "succeeded", imageId, captionCount: captions.length });
  revalidatePath("/media");
  revalidatePath("/");
  return NextResponse.json({ id: imageId }, { status: 201 });
}
