import type { Supabase } from "@/lib/admin";
import type { CaptionScore, Profile } from "@/lib/types";

/**
 * Shared data helpers. Every query here runs with the signed-in admin's
 * session, so Row Level Security decides what comes back.
 */

/** PostgREST puts `.in()` filters in the URL, so long id lists are split up. */
const CHUNK = 80;

export async function inChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error?: { message: string } | null }>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await run(unique.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    if (data) out.push(...data);
  }
  return out;
}

/** Vote totals per caption id (from the public caption_scores view). */
export async function scoresFor(supabase: Supabase, captionIds: string[]): Promise<Map<string, CaptionScore>> {
  const rows = await inChunks<CaptionScore>(captionIds, (chunk) =>
    supabase.from("caption_scores").select("*").in("caption_id", chunk),
  );
  return new Map(rows.map((r) => [r.caption_id, r]));
}

/** Profiles by user id (admins can read every profile). */
export async function profilesFor(supabase: Supabase, userIds: string[]): Promise<Map<string, Profile>> {
  const rows = await inChunks<Profile>(userIds, (chunk) =>
    supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, is_superadmin, created_at, last_sign_in_at")
      .in("id", chunk),
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Fetches every row of a table in pages of 1,000 (PostgREST's default cap).
 * Fine at class-project scale; stops at `max` rows as a safety valve.
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 20_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
