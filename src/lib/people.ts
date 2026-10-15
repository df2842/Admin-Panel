import type { Supabase } from "@/lib/admin";
import { fetchAll, inChunks, scoresFor } from "@/lib/data";
import type { CaptionScore, Profile } from "@/lib/types";

/**
 * Read-only data for the Users and Votes pages. Every query runs with the
 * signed-in superadmin's session, so Row Level Security decides what comes
 * back. Nothing in here writes to the database.
 */

/** Strict UUID (a stricter form of /^[0-9a-f-]{36}$/i, so Postgres never sees a malformed id). */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PROFILE_COLUMNS = "id, email, full_name, avatar_url, is_superadmin, created_at, last_sign_in_at";
const DAY_MS = 86_400_000;

/* ---- searchParams parsing ------------------------------------------------ */

export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a search param, trimmed and length-capped. */
export function param(sp: SearchParams, key: string, max = 100): string {
  const raw = sp[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Returns `value` if it is one of `allowed`, otherwise `fallback`. */
export function pickEnum<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** A 1-based page number, clamped to something sane. */
export function parsePage(value: string): number {
  if (!/^\d{1,5}$/.test(value)) return 1;
  return Math.min(Math.max(Number(value), 1), 10_000);
}

/** Builds `path?query`, dropping empty values so URLs stay clean. */
export function hrefWith(path: string, params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/* ---- errors -------------------------------------------------------------- */

type DbError = { message: string; code?: string } | null | undefined;

/** PostgREST codes for "that table doesn't exist" (migration not run yet). */
const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST200"]);

export function isMissingTable(error: DbError): boolean {
  return !!error && MISSING_TABLE.has(error.code ?? "");
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong loading this data.";
}

/** Thrown when the week6-admin.sql migration hasn't created `profiles` yet. */
class ProfilesMissing extends Error {}

/** Every profile, oldest first. Throws ProfilesMissing if the table is absent. */
async function allProfiles(supabase: Supabase): Promise<Profile[]> {
  const out: Profile[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (isMissingTable(error)) throw new ProfilesMissing();
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Profile[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/** Profiles plus a flag instead of an exception when the table is missing. */
export async function loadProfiles(supabase: Supabase): Promise<{ profiles: Profile[]; profilesMissing: boolean }> {
  try {
    return { profiles: await allProfiles(supabase), profilesMissing: false };
  } catch (err) {
    if (err instanceof ProfilesMissing) return { profiles: [], profilesMissing: true };
    throw err;
  }
}

/* ---- people (Users page) --------------------------------------------------- */

export type PersonStats = {
  /** Photos they uploaded. */
  photos: number;
  /** Jokes (captions) on their photos. */
  jokes: number;
  /** Votes they cast. */
  upGiven: number;
  downGiven: number;
  /** Votes the jokes on their photos received. */
  upReceived: number;
  downReceived: number;
  /** Net score (up - down) the jokes on their photos received. */
  score: number;
  /** Latest of: sign-in, upload, vote. */
  lastActiveAt: string | null;
  /** Profile creation, or their first upload/vote when there's no profile. */
  firstSeenAt: string | null;
};

export type Person = { id: string; profile: Profile | null; stats: PersonStats };

function emptyStats(): PersonStats {
  return {
    photos: 0,
    jokes: 0,
    upGiven: 0,
    downGiven: 0,
    upReceived: 0,
    downReceived: 0,
    score: 0,
    lastActiveAt: null,
    firstSeenAt: null,
  };
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(b).getTime() < new Date(a).getTime() ? b : a;
}

export function votesCast(s: PersonStats): number {
  return s.upGiven + s.downGiven;
}

/** "Most active" = photos uploaded + votes cast. */
export function activity(s: PersonStats): number {
  return s.photos + votesCast(s);
}

/**
 * Every user with their activity totals. Users who left activity behind but
 * have no profile row (or when the profiles table is missing) are included
 * with `profile: null` so nothing disappears.
 */
export async function loadPeople(supabase: Supabase): Promise<{ people: Person[]; profilesMissing: boolean }> {
  type ImageLite = { id: string; user_id: string; created_at: string };
  type CaptionLite = { id: string; image_id: string };
  type VoteLite = { id: number; user_id: string; value: number; created_at: string };

  const [{ profiles, profilesMissing }, images, captions, scores, votes] = await Promise.all([
    loadProfiles(supabase),
    fetchAll<ImageLite>((from, to) =>
      supabase.from("images").select("id, user_id, created_at").order("id").range(from, to),
    ),
    fetchAll<CaptionLite>((from, to) => supabase.from("captions").select("id, image_id").order("id").range(from, to)),
    // Received totals come from the public caption_scores view, the same
    // source the profile page and the main app use.
    fetchAll<CaptionScore>((from, to) =>
      supabase.from("caption_scores").select("caption_id, score, upvotes, downvotes").order("caption_id").range(from, to),
    ),
    fetchAll<VoteLite>((from, to) =>
      supabase.from("votes").select("id, user_id, value, created_at").order("id").range(from, to),
    ),
  ]);

  const stats = new Map<string, PersonStats>();
  const statsFor = (userId: string) => {
    let s = stats.get(userId);
    if (!s) {
      s = emptyStats();
      stats.set(userId, s);
    }
    return s;
  };

  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (const p of profiles) {
    const s = statsFor(p.id);
    s.firstSeenAt = p.created_at;
    s.lastActiveAt = p.last_sign_in_at;
  }

  const imageOwner = new Map<string, string>();
  for (const img of images) {
    imageOwner.set(img.id, img.user_id);
    const s = statsFor(img.user_id);
    s.photos += 1;
    s.lastActiveAt = later(s.lastActiveAt, img.created_at);
    if (!byId.has(img.user_id)) s.firstSeenAt = earlier(s.firstSeenAt, img.created_at);
  }

  const captionOwner = new Map<string, string>();
  for (const c of captions) {
    const owner = imageOwner.get(c.image_id);
    if (!owner) continue;
    captionOwner.set(c.id, owner);
    statsFor(owner).jokes += 1;
  }

  for (const row of scores) {
    const owner = captionOwner.get(row.caption_id);
    if (!owner) continue;
    const s = statsFor(owner);
    s.score += Number(row.score) || 0;
    s.upReceived += Number(row.upvotes) || 0;
    s.downReceived += Number(row.downvotes) || 0;
  }

  for (const v of votes) {
    const voter = statsFor(v.user_id);
    if (v.value > 0) voter.upGiven += 1;
    else voter.downGiven += 1;
    voter.lastActiveAt = later(voter.lastActiveAt, v.created_at);
    if (!byId.has(v.user_id)) voter.firstSeenAt = earlier(voter.firstSeenAt, v.created_at);
  }

  const people: Person[] = [...stats.entries()].map(([id, s]) => ({ id, profile: byId.get(id) ?? null, stats: s }));
  return { people, profilesMissing };
}

/* ---- one person (Users/[id] page) ------------------------------------------ */

export type PersonPhoto = {
  id: string;
  public_url: string;
  description: string;
  created_at: string;
  jokes: number;
  score: number;
};

export type PersonVote = {
  id: number;
  value: number;
  created_at: string;
  caption: { id: string; text: string; image_id: string; image_url: string | null } | null;
};

export type PersonDetail = {
  profile: Profile | null;
  profilesMissing: boolean;
  photos: PersonPhoto[];
  stats: PersonStats;
  recentVotes: PersonVote[];
};

type EmbeddedVote = {
  id: number;
  value: number;
  created_at: string;
  captions:
    | { id: string; text: string; image_id: string; images: { id: string; public_url: string } | null }
    | null;
};

export const RECENT_VOTES = 25;

/** Everything the profile page needs. Returns null when the user has no trace at all. */
export async function loadPerson(supabase: Supabase, id: string): Promise<PersonDetail | null> {
  const [profileRes, photoRows, upRes, downRes, votesRes] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle(),
    fetchAll<{ id: string; public_url: string; description: string; created_at: string }>((from, to) =>
      supabase
        .from("images")
        .select("id, public_url, description, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    supabase.from("votes").select("id", { count: "exact", head: true }).eq("user_id", id).eq("value", 1),
    supabase.from("votes").select("id", { count: "exact", head: true }).eq("user_id", id).eq("value", -1),
    supabase
      .from("votes")
      .select("id, value, created_at, captions(id, text, image_id, images(id, public_url))")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(RECENT_VOTES),
  ]);

  const profilesMissing = isMissingTable(profileRes.error);
  if (profileRes.error && !profilesMissing) throw new Error(profileRes.error.message);
  if (upRes.error) throw new Error(upRes.error.message || "Could not count votes.");
  if (downRes.error) throw new Error(downRes.error.message || "Could not count votes.");
  if (votesRes.error) throw new Error(votesRes.error.message);

  const profile = (profileRes.data as Profile | null) ?? null;

  // Jokes on their photos and the votes those jokes received.
  const captions = await inChunks<{ id: string; image_id: string }>(
    photoRows.map((p) => p.id),
    (chunk) => supabase.from("captions").select("id, image_id").in("image_id", chunk),
  );
  const scores = await scoresFor(
    supabase,
    captions.map((c) => c.id),
  );

  const perPhoto = new Map<string, { jokes: number; score: number }>();
  const stats = emptyStats();
  for (const c of captions) {
    const s = scores.get(c.id);
    const entry = perPhoto.get(c.image_id) ?? { jokes: 0, score: 0 };
    entry.jokes += 1;
    const score = Number(s?.score) || 0;
    entry.score += score;
    perPhoto.set(c.image_id, entry);
    stats.jokes += 1;
    stats.score += score;
    stats.upReceived += Number(s?.upvotes) || 0;
    stats.downReceived += Number(s?.downvotes) || 0;
  }

  const photos: PersonPhoto[] = photoRows.map((p) => ({
    ...p,
    jokes: perPhoto.get(p.id)?.jokes ?? 0,
    score: perPhoto.get(p.id)?.score ?? 0,
  }));

  const recentVotes: PersonVote[] = ((votesRes.data ?? []) as unknown as EmbeddedVote[]).map((v) => {
    const c = Array.isArray(v.captions) ? (v.captions[0] ?? null) : v.captions;
    const img = c ? (Array.isArray(c.images) ? (c.images[0] ?? null) : c.images) : null;
    return {
      id: v.id,
      value: v.value,
      created_at: v.created_at,
      caption: c ? { id: c.id, text: c.text, image_id: c.image_id, image_url: img?.public_url ?? null } : null,
    };
  });

  stats.photos = photos.length;
  stats.upGiven = upRes.count ?? 0;
  stats.downGiven = downRes.count ?? 0;
  stats.firstSeenAt = profile?.created_at ?? photos[photos.length - 1]?.created_at ?? null;
  stats.lastActiveAt = later(
    later(profile?.last_sign_in_at ?? null, photos[0]?.created_at ?? null),
    recentVotes[0]?.created_at ?? null,
  );

  if (!profile && photos.length === 0 && votesCast(stats) === 0) return null;
  return { profile, profilesMissing, photos, stats, recentVotes };
}

/* ---- votes (Votes page) ---------------------------------------------------- */

export const VOTE_VALUES = ["all", "up", "down"] as const;
export const VOTE_RANGES = ["all", "7d", "30d", "90d"] as const;
export type VoteValueFilter = (typeof VOTE_VALUES)[number];
export type VoteRange = (typeof VOTE_RANGES)[number];

export const RANGE_DAYS: Record<Exclude<VoteRange, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

export type VoteFilters = {
  value: VoteValueFilter;
  range: VoteRange;
  /** Voter user id, or "" for everyone. */
  voter: string;
  page: number;
};

export function parseVoteFilters(sp: SearchParams): VoteFilters {
  const voter = param(sp, "voter", 36);
  return {
    value: pickEnum(param(sp, "value", 10), VOTE_VALUES, "all"),
    range: pickEnum(param(sp, "range", 10), VOTE_RANGES, "all"),
    voter: UUID.test(voter) ? voter.toLowerCase() : "",
    page: parsePage(param(sp, "page", 6)),
  };
}

/** ISO cutoff for a range preset, relative to the request time. */
export function rangeStart(range: VoteRange, now: number): string | null {
  return range === "all" ? null : new Date(now - RANGE_DAYS[range] * DAY_MS).toISOString();
}

export const VOTES_PER_PAGE = 50;

export type VoteListRow = {
  id: number;
  value: number;
  created_at: string;
  user_id: string;
  caption: { id: string; text: string; image_id: string; image_url: string | null } | null;
};

export type VotesPageData = {
  total: number;
  upvotes: number;
  downvotes: number;
  uniqueVoters: number;
  page: number;
  totalPages: number;
  rows: VoteListRow[];
  voters: Map<string, Profile>;
  /** Options for the voter filter: every profile, or voter ids if profiles are missing. */
  voterOptions: { id: string; profile: Profile | null }[];
  profilesMissing: boolean;
};

type EmbeddedVoteRow = EmbeddedVote & { user_id: string };

export async function loadVotes(supabase: Supabase, f: VoteFilters, now: number): Promise<VotesPageData> {
  const since = rangeStart(f.range, now);
  const filtered = (columns: string, withCount = false) => {
    let q = supabase.from("votes").select(columns, withCount ? { count: "exact" } : undefined);
    if (f.value !== "all") q = q.eq("value", f.value === "up" ? 1 : -1);
    if (since) q = q.gte("created_at", since);
    if (f.voter) q = q.eq("user_id", f.voter);
    return q;
  };

  // Summary over every vote that matches the filters (small at class scale).
  const [summary, { profiles, profilesMissing }] = await Promise.all([
    fetchAll<{ id: number; user_id: string; value: number }>(
      (from, to) =>
        filtered("id, user_id, value").order("id").range(from, to) as unknown as PromiseLike<{
          data: { id: number; user_id: string; value: number }[] | null;
          error: { message: string } | null;
        }>,
    ),
    loadProfiles(supabase),
  ]);

  const total = summary.length;
  const upvotes = summary.filter((v) => v.value > 0).length;
  const uniqueVoters = new Set(summary.map((v) => v.user_id)).size;
  const totalPages = Math.max(1, Math.ceil(total / VOTES_PER_PAGE));
  const page = Math.min(f.page, totalPages);

  let rows: VoteListRow[] = [];
  if (total > 0) {
    const from = (page - 1) * VOTES_PER_PAGE;
    const { data, error } = await filtered(
      "id, value, created_at, user_id, captions(id, text, image_id, images(id, public_url))",
    )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + VOTES_PER_PAGE - 1);
    if (error) throw new Error(error.message);
    rows = ((data ?? []) as unknown as EmbeddedVoteRow[]).map((v) => {
      const c = Array.isArray(v.captions) ? (v.captions[0] ?? null) : v.captions;
      const img = c ? (Array.isArray(c.images) ? (c.images[0] ?? null) : c.images) : null;
      return {
        id: v.id,
        value: v.value,
        created_at: v.created_at,
        user_id: v.user_id,
        caption: c ? { id: c.id, text: c.text, image_id: c.image_id, image_url: img?.public_url ?? null } : null,
      };
    });
  }

  const voters = new Map(profiles.map((p) => [p.id, p]));

  let voterOptions: { id: string; profile: Profile | null }[];
  if (profilesMissing) {
    // No names available: offer every id that has ever voted.
    const ids = await fetchAll<{ id: number; user_id: string }>((from, to) =>
      supabase.from("votes").select("id, user_id").order("id").range(from, to),
    );
    voterOptions = [...new Set(ids.map((v) => v.user_id))].sort().map((id) => ({ id, profile: null }));
  } else {
    voterOptions = [...profiles]
      .sort((a, b) =>
        (a.full_name || a.email || a.id).localeCompare(b.full_name || b.email || b.id, "en", { sensitivity: "base" }),
      )
      .map((p) => ({ id: p.id, profile: p }));
  }
  if (f.voter && !voterOptions.some((o) => o.id === f.voter)) {
    voterOptions.unshift({ id: f.voter, profile: voters.get(f.voter) ?? null });
  }

  return {
    total,
    upvotes,
    downvotes: total - upvotes,
    uniqueVoters,
    page,
    totalPages,
    rows,
    voters,
    voterOptions,
    profilesMissing,
  };
}
