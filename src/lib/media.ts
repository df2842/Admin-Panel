import type { Supabase } from "@/lib/admin";
import { fetchAll, profilesFor, scoresFor } from "@/lib/data";
import { prettyModel } from "@/lib/joke-styles";
import type { CaptionRow, CaptionScore, ImageRow, Profile, ScoredCaption } from "@/lib/types";
import { trustedImageUrl } from "@/lib/format";

/**
 * Media (photos + their jokes) helpers shared by the /media pages, the media
 * server actions and POST /api/media. The constants and validators at the top
 * are plain values, so client components can import them too.
 */

// ---- Limits ------------------------------------------------------------------

export const PAGE_SIZE = 24;
/** Hard cap on jokes per photo (AI batches and manual adds both respect it). */
export const MAX_JOKES_PER_PHOTO = 16;
/** How many jokes one "Generate with AI" click asks for. */
export const AI_BATCH = 4;
/** Joke lines an admin can type on the "New media" form. */
export const MAX_MANUAL_JOKES = 6;
export const CAPTION_MAX = 200;
export const DESCRIPTION_MAX = 2000;
export const SEARCH_MAX = 100;
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
/** Model name stored on jokes an admin typed by hand. */
export const MANUAL_MODEL = "manual";
/** Public Caption Arena app; photos live at /gallery/{id} there. */
export const APP_URL = "https://hello-world-the-humor-project.vercel.app";

// ---- Validation ----------------------------------------------------------------

export const UUID_RE = /^[0-9a-f-]{36}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Trims and collapses whitespace (jokes and descriptions are single
 * paragraphs). Returns null unless the result is 1..max characters.
 */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length > max * 4) return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length >= 1 && text.length <= max ? text : null;
}

export const SORTS = {
  newest: "Newest",
  votes: "Most votes",
  score: "Best score",
} as const;

export type MediaSort = keyof typeof SORTS;

export function parseSort(value: unknown): MediaSort {
  return typeof value === "string" && Object.hasOwn(SORTS, value) ? (value as MediaSort) : "newest";
}

export type UploadMediaType = "image/jpeg" | "image/png" | "image/webp";

export const UPLOAD_EXT: Record<UploadMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Identifies the real file type from its first bytes instead of trusting the browser. */
export function sniffImage(bytes: Uint8Array): UploadMediaType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Result shape of every media server action. */
export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

// ---- Display helpers -----------------------------------------------------------

export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Uploader / author label: name or email, else a short user id. */
export function personLabel(profile: Profile | undefined | null, userId: string): string {
  return profile?.full_name || profile?.email || `User ${shortId(userId)}`;
}

/** "Manual", "Gemini 3.5 Flash-Lite", or "AI" for older rows without a model. */
export function modelLabel(model: string | null | undefined): string {
  if (model === MANUAL_MODEL) return "Manual";
  if (!model) return "AI";
  return prettyModel(model);
}

// ---- Data: list ------------------------------------------------------------------

export type MediaListItem = {
  id: string;
  user_id: string;
  public_url: string;
  description: string;
  created_at: string;
  jokes: number;
  votes: number;
  upvotes: number;
  downvotes: number;
  score: number;
  topJoke: { text: string; score: number } | null;
};

export type MediaList = {
  items: MediaListItem[];
  /** Matches after search/filter, before pagination. */
  total: number;
  page: number;
  pages: number;
  /** Whole-library totals (ignores search). */
  totals: { photos: number; jokes: number; votes: number };
  people: Map<string, Profile>;
};

type ImageWithCaptionStubs = ImageRow & {
  captions: { id: string; text: string; created_at: string }[] | null;
};

/**
 * Every photo with its joke/vote aggregates, filtered, sorted and paginated.
 * Loads the whole library in pages of 1,000 rows, which is fine at class
 * project scale and lets search and sorting cover jokes and vote totals.
 */
export async function loadMediaList(
  supabase: Supabase,
  options: { q: string; sort: MediaSort; page: number; userId: string | null },
): Promise<MediaList> {
  const [images, scoreRows] = await Promise.all([
    fetchAll<ImageWithCaptionStubs>((from, to) =>
      supabase
        .from("images")
        .select("id, user_id, storage_path, public_url, description, created_at, captions(id, text, created_at)")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
        .overrideTypes<ImageWithCaptionStubs[], { merge: false }>(),
    ),
    fetchAll<CaptionScore>((from, to) =>
      supabase
        .from("caption_scores")
        .select("caption_id, score, upvotes, downvotes")
        .order("caption_id")
        .range(from, to)
        .overrideTypes<CaptionScore[], { merge: false }>(),
    ),
  ]);
  const scores = new Map(scoreRows.map((s) => [s.caption_id, s]));

  const all: MediaListItem[] = images.map((image) => {
    const captions = image.captions ?? [];
    let upvotes = 0;
    let downvotes = 0;
    let score = 0;
    let top: { text: string; score: number; upvotes: number; created_at: string } | null = null;
    for (const c of captions) {
      const s = scores.get(c.id);
      const cs = s?.score ?? 0;
      const cu = s?.upvotes ?? 0;
      upvotes += cu;
      downvotes += s?.downvotes ?? 0;
      score += cs;
      // Best score wins; ties go to more upvotes, then the older joke.
      if (
        !top ||
        cs > top.score ||
        (cs === top.score && (cu > top.upvotes || (cu === top.upvotes && c.created_at < top.created_at)))
      ) {
        top = { text: c.text, score: cs, upvotes: cu, created_at: c.created_at };
      }
    }
    return {
      id: image.id,
      user_id: image.user_id,
      public_url: trustedImageUrl(image.public_url),
      description: image.description,
      created_at: image.created_at,
      jokes: captions.length,
      votes: upvotes + downvotes,
      upvotes,
      downvotes,
      score,
      topJoke: top ? { text: top.text, score: top.score } : null,
    };
  });

  const totals = {
    photos: all.length,
    jokes: all.reduce((n, i) => n + i.jokes, 0),
    votes: all.reduce((n, i) => n + i.votes, 0),
  };

  const needle = options.q.toLowerCase();
  const textById = new Map(images.map((i) => [i.id, i]));
  let matches = all.filter((item) => {
    if (options.userId && item.user_id !== options.userId) return false;
    if (!needle) return true;
    if (item.description.toLowerCase().includes(needle)) return true;
    return (textById.get(item.id)?.captions ?? []).some((c) => c.text.toLowerCase().includes(needle));
  });

  const newest = (a: MediaListItem, b: MediaListItem) => b.created_at.localeCompare(a.created_at);
  if (options.sort === "votes") {
    matches = matches.toSorted((a, b) => b.votes - a.votes || b.score - a.score || newest(a, b));
  } else if (options.sort === "score") {
    matches = matches.toSorted((a, b) => b.score - a.score || b.votes - a.votes || newest(a, b));
  } else {
    matches = matches.toSorted(newest);
  }

  const total = matches.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, options.page), pages);
  const items = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const peopleIds = items.map((i) => i.user_id);
  if (options.userId) peopleIds.push(options.userId);
  const people = await profilesFor(supabase, peopleIds);

  return { items, total, page, pages, totals, people };
}

// ---- Data: one photo -----------------------------------------------------------

export type MediaDetail = {
  image: ImageRow;
  /** Oldest first, so the list stays stable while editing. */
  captions: ScoredCaption[];
  /** Highest-scoring joke with a positive score, if any. */
  topCaptionId: string | null;
  people: Map<string, Profile>;
};

/** One photo with every joke and its vote totals. Null when the id doesn't exist. */
export async function loadMedia(supabase: Supabase, id: string): Promise<MediaDetail | null> {
  const { data: image, error } = await supabase
    .from("images")
    .select("id, user_id, storage_path, public_url, description, created_at")
    .eq("id", id)
    .maybeSingle<ImageRow>();
  if (error) throw new Error(error.message);
  if (!image) return null;

  const { data: rows, error: captionError } = await supabase
    .from("captions")
    .select("id, image_id, user_id, text, model, created_at")
    .eq("image_id", id)
    .order("created_at")
    .order("id")
    .overrideTypes<CaptionRow[], { merge: false }>();
  if (captionError) throw new Error(captionError.message);

  const captionRows = rows ?? [];
  const [scores, people] = await Promise.all([
    scoresFor(
      supabase,
      captionRows.map((c) => c.id),
    ),
    profilesFor(supabase, [image.user_id, ...captionRows.map((c) => c.user_id)]),
  ]);

  const captions: ScoredCaption[] = captionRows.map((c) => {
    const s = scores.get(c.id);
    return { ...c, score: s?.score ?? 0, upvotes: s?.upvotes ?? 0, downvotes: s?.downvotes ?? 0 };
  });

  let top: ScoredCaption | null = null;
  for (const c of captions) {
    if (c.score <= 0) continue;
    if (!top || c.score > top.score || (c.score === top.score && c.upvotes > top.upvotes)) top = c;
  }

  return { image, captions, topCaptionId: top?.id ?? null, people };
}
