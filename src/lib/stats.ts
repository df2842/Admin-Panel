import type { Supabase } from "@/lib/admin";
import { fetchAll } from "@/lib/data";
import { prettyModel } from "@/lib/joke-styles";
import type { CaptionRow, ImageRow, Profile, VoteRow } from "@/lib/types";

/**
 * Everything the dashboard shows, computed in one pass from full table reads.
 * The data is class-project sized, so reading every row and aggregating in
 * memory is simpler (and just as fast) as a pile of SQL views. Every query
 * runs with the signed-in superadmin's session, so RLS still applies.
 */

const DAY_MS = 86_400_000;
export const TIMELINE_DAYS = 30;
export const RECENT_DAYS = 7;
const LEADERBOARD_SIZE = 5;
const BEST_PHOTOS = 3;
/** Voters need this many votes to win a crowd award (relaxed while nobody has that many). */
export const MIN_VOTES_FOR_AWARD = 3;

export const LENGTH_BUCKETS = [
  { key: "short", label: "Short", range: "Under 60 characters", max: 59 },
  { key: "medium", label: "Medium", range: "60 to 79 characters", max: 79 },
  { key: "long", label: "Long", range: "80 characters or more", max: Number.POSITIVE_INFINITY },
] as const;

export type Person = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  /** False when the profile row is missing or profiles couldn't be read. */
  known: boolean;
};

export type JokeStat = {
  id: string;
  text: string;
  model: string | null;
  createdAt: string;
  imageId: string;
  imageUrl: string | null;
  imageDescription: string | null;
  upvotes: number;
  downvotes: number;
  votes: number;
  score: number;
};

export type PhotoStat = {
  id: string;
  url: string;
  description: string;
  createdAt: string;
  uploader: Person;
  jokes: number;
  votedJokes: number;
  votes: number;
  upvotes: number;
  netScore: number;
  /** Mean score of this photo's jokes that received at least one vote. */
  avgScore: number | null;
  bestJoke: JokeStat | null;
};

export type VoterStat = {
  person: Person;
  votes: number;
  upvotes: number;
  downvotes: number;
  upShare: number;
};

export type UploaderStat = {
  person: Person;
  photos: number;
  jokes: number;
  votes: number;
  netScore: number;
};

export type DayVotes = { date: string; up: number; down: number };

export type BucketStat = {
  key: string;
  label: string;
  range: string;
  jokes: number;
  votedJokes: number;
  votes: number;
  avgScore: number | null;
};

export type ModelStat = {
  key: string;
  label: string;
  jokes: number;
  votedJokes: number;
  votes: number;
  upvotes: number;
  avgScore: number | null;
  upShare: number | null;
};

export type HeatmapStats = {
  /** counts[weekday][hour], weekday 0 = Monday, hours in UTC. */
  counts: number[][];
  max: number;
  busiest: { day: number; hour: number; count: number } | null;
  busiestDay: { day: number; count: number } | null;
  busiestHour: { hour: number; count: number } | null;
};

export type DashboardStats = {
  generatedAt: string;
  profiles: { ok: boolean; error: string | null };
  totals: {
    users: number;
    /** "profiles" counts every signed-in account; "activity" counts people seen in the data. */
    usersSource: "profiles" | "activity";
    photos: number;
    jokes: number;
    votes: number;
    upvotes: number;
    downvotes: number;
    voters: number;
    votedJokes: number;
    laughRate: number | null;
    jokesPerPhoto: number | null;
    votesPerJoke: number | null;
  };
  /** Rows created in the last RECENT_DAYS days. `users` is null without profiles. */
  recent: { users: number | null; photos: number; jokes: number; votes: number };
  daily: DayVotes[];
  heatmap: HeatmapStats;
  funniest: JokeStat[];
  controversial: JokeStat[];
  bestPhotos: PhotoStat[];
  crowd: {
    generous: VoterStat | null;
    critic: VoterStat | null;
    mostActive: VoterStat | null;
    topUploader: UploaderStat | null;
    /** True when fewer than two people have MIN_VOTES_FOR_AWARD votes, so every voter was considered. */
    smallSample: boolean;
  };
  verdicts: { loved: number; even: number; disliked: number; unvoted: number };
  lengths: BucketStat[];
  models: ModelStat[];
};

const IMAGE_COLUMNS = "id, user_id, storage_path, public_url, description, created_at";
const CAPTION_COLUMNS = "id, image_id, user_id, text, model, created_at";
const VOTE_COLUMNS = "id, caption_id, user_id, value, created_at";
const PROFILE_COLUMNS = "id, email, full_name, avatar_url, is_superadmin, created_at, last_sign_in_at";

const sum = <T>(items: T[], pick: (item: T) => number) => items.reduce((total, item) => total + pick(item), 0);

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

export async function getDashboardStats(supabase: Supabase): Promise<DashboardStats> {
  const [images, captions, votes, profileResult] = await Promise.all([
    fetchAll<ImageRow>((from, to) =>
      supabase.from("images").select(IMAGE_COLUMNS).order("created_at").order("id").range(from, to),
    ),
    fetchAll<CaptionRow>((from, to) =>
      supabase.from("captions").select(CAPTION_COLUMNS).order("created_at").order("id").range(from, to),
    ),
    fetchAll<VoteRow>((from, to) => supabase.from("votes").select(VOTE_COLUMNS).order("id").range(from, to)),
    // Profiles are optional: if the table is missing, everything else still renders.
    fetchAll<Profile>((from, to) =>
      supabase.from("profiles").select(PROFILE_COLUMNS).order("created_at").order("id").range(from, to),
    ).then(
      (rows) => ({ rows, error: null as string | null }),
      (e: unknown) => ({ rows: [] as Profile[], error: errorMessage(e) }),
    ),
  ]);

  const now = Date.now();
  const recentSince = now - RECENT_DAYS * DAY_MS;
  const isRecent = (iso: string | null | undefined) => !!iso && Date.parse(iso) >= recentSince;

  const profilesOk = profileResult.error === null;
  const profileById = new Map(profileResult.rows.map((p) => [p.id, p]));
  const personFor = (id: string): Person => {
    const p = profileById.get(id);
    const fallback = `User ${id.slice(0, 8)}`;
    if (!p) return { id, name: fallback, email: null, avatarUrl: null, known: false };
    return {
      id,
      name: p.full_name?.trim() || p.email || fallback,
      email: p.email,
      avatarUrl: p.avatar_url && /^https:\/\//i.test(p.avatar_url) ? p.avatar_url : null,
      known: true,
    };
  };

  // ---- Vote tallies per caption and per voter -------------------------------
  const byCaption = new Map<string, { up: number; down: number }>();
  const byVoter = new Map<string, { up: number; down: number }>();
  let upvotes = 0;
  let downvotes = 0;
  for (const v of votes) {
    const isUp = Number(v.value) > 0;
    if (isUp) upvotes++;
    else downvotes++;
    for (const [map, key] of [
      [byCaption, v.caption_id],
      [byVoter, v.user_id],
    ] as const) {
      const t = map.get(key) ?? { up: 0, down: 0 };
      if (isUp) t.up++;
      else t.down++;
      map.set(key, t);
    }
  }

  // ---- Jokes ----------------------------------------------------------------
  const imageById = new Map(images.map((i) => [i.id, i]));
  const jokes: JokeStat[] = captions.map((c) => {
    const t = byCaption.get(c.id) ?? { up: 0, down: 0 };
    const img = imageById.get(c.image_id);
    return {
      id: c.id,
      text: c.text,
      model: c.model,
      createdAt: c.created_at,
      imageId: c.image_id,
      imageUrl: img?.public_url ?? null,
      imageDescription: img?.description ?? null,
      upvotes: t.up,
      downvotes: t.down,
      votes: t.up + t.down,
      score: t.up - t.down,
    };
  });
  const voted = jokes.filter((j) => j.votes > 0);
  const oldestFirst = (a: JokeStat, b: JokeStat) => a.createdAt.localeCompare(b.createdAt);

  const funniest = jokes
    .filter((j) => j.score > 0)
    .sort((a, b) => b.score - a.score || b.upvotes - a.upvotes || oldestFirst(a, b))
    .slice(0, LEADERBOARD_SIZE);

  // Controversial = the room is split: both sides voted, and the smaller side is as big as possible.
  const controversial = jokes
    .filter((j) => j.upvotes > 0 && j.downvotes > 0)
    .sort(
      (a, b) =>
        Math.min(b.upvotes, b.downvotes) - Math.min(a.upvotes, a.downvotes) ||
        b.votes - a.votes ||
        Math.abs(a.score) - Math.abs(b.score) ||
        oldestFirst(a, b),
    )
    .slice(0, LEADERBOARD_SIZE);

  // ---- Photos ---------------------------------------------------------------
  const jokesByImage = groupBy(jokes, (j) => j.imageId);
  const photoStats: PhotoStat[] = images.map((img) => {
    const list = jokesByImage.get(img.id) ?? [];
    const withVotes = list.filter((j) => j.votes > 0);
    const best = [...withVotes].sort((a, b) => b.score - a.score || b.upvotes - a.upvotes)[0] ?? null;
    return {
      id: img.id,
      url: img.public_url,
      description: img.description,
      createdAt: img.created_at,
      uploader: personFor(img.user_id),
      jokes: list.length,
      votedJokes: withVotes.length,
      votes: sum(list, (j) => j.votes),
      upvotes: sum(list, (j) => j.upvotes),
      netScore: sum(list, (j) => j.score),
      avgScore: withVotes.length ? sum(withVotes, (j) => j.score) / withVotes.length : null,
      bestJoke: best,
    };
  });
  const bestPhotos = photoStats
    .filter((p) => p.avgScore !== null)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0) || b.votes - a.votes || a.createdAt.localeCompare(b.createdAt))
    .slice(0, BEST_PHOTOS);

  // ---- Timeline (last 30 UTC days) and weekday x hour heatmap ---------------
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const firstDay = today - (TIMELINE_DAYS - 1) * DAY_MS;
  const daily: DayVotes[] = Array.from({ length: TIMELINE_DAYS }, (_, i) => ({
    date: new Date(firstDay + i * DAY_MS).toISOString().slice(0, 10),
    up: 0,
    down: 0,
  }));
  const counts = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const v of votes) {
    const t = Date.parse(v.created_at);
    if (Number.isNaN(t)) continue;
    const idx = Math.floor((t - firstDay) / DAY_MS);
    if (idx >= 0 && idx < TIMELINE_DAYS) {
      if (Number(v.value) > 0) daily[idx].up++;
      else daily[idx].down++;
    }
    const d = new Date(t);
    counts[(d.getUTCDay() + 6) % 7][d.getUTCHours()]++;
  }
  let busiest: HeatmapStats["busiest"] = null;
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = counts[day][hour];
      if (count > 0 && (busiest === null || count > busiest.count)) busiest = { day, hour, count };
    }
  }
  const dayTotals = counts.map((row) => sum(row, (c) => c));
  const hourTotals = Array.from({ length: 24 }, (_, h) => sum(counts, (row) => row[h]));
  const topDay = dayTotals.reduce((best, c, i) => (c > dayTotals[best] ? i : best), 0);
  const topHour = hourTotals.reduce((best, c, i) => (c > hourTotals[best] ? i : best), 0);
  const heatmap: HeatmapStats = {
    counts,
    max: Math.max(0, ...counts.flat()),
    busiest,
    busiestDay: dayTotals[topDay] > 0 ? { day: topDay, count: dayTotals[topDay] } : null,
    busiestHour: hourTotals[topHour] > 0 ? { hour: topHour, count: hourTotals[topHour] } : null,
  };

  // ---- Crowd personalities --------------------------------------------------
  const voters: VoterStat[] = [...byVoter].map(([id, t]) => ({
    person: personFor(id),
    votes: t.up + t.down,
    upvotes: t.up,
    downvotes: t.down,
    upShare: t.up / (t.up + t.down),
  }));
  // Awards compare people, so they need at least two qualified voters; until
  // then every voter counts (and the UI says it's a small sample).
  const qualified = voters.filter((v) => v.votes >= MIN_VOTES_FOR_AWARD);
  const smallSample = qualified.length < 2 && voters.length > qualified.length;
  const pool = smallSample ? voters : qualified;
  const byName = (a: VoterStat, b: VoterStat) => a.person.name.localeCompare(b.person.name);

  const generous =
    pool
      .filter((v) => v.upvotes > 0)
      .sort((a, b) => b.upShare - a.upShare || b.votes - a.votes || byName(a, b))[0] ?? null;
  const critics = pool
    .filter((v) => v.downvotes > 0)
    .sort((a, b) => a.upShare - b.upShare || b.votes - a.votes || byName(a, b));
  // Prefer someone other than the most generous voter, when anyone else qualifies.
  const critic = critics.find((v) => v.person.id !== generous?.person.id) ?? critics[0] ?? null;
  const mostActive = [...voters].sort((a, b) => b.votes - a.votes || b.upvotes - a.upvotes || byName(a, b))[0] ?? null;

  const uploaders: UploaderStat[] = [...groupBy(photoStats, (p) => p.uploader.id)].map(([, list]) => ({
    person: list[0].uploader,
    photos: list.length,
    jokes: sum(list, (p) => p.jokes),
    votes: sum(list, (p) => p.votes),
    netScore: sum(list, (p) => p.netScore),
  }));
  const topUploader =
    uploaders.sort((a, b) => b.netScore - a.netScore || b.photos - a.photos || b.votes - a.votes)[0] ?? null;

  // ---- Verdicts, length buckets, models ------------------------------------
  const verdicts = {
    loved: voted.filter((j) => j.score > 0).length,
    even: voted.filter((j) => j.score === 0).length,
    disliked: voted.filter((j) => j.score < 0).length,
    unvoted: jokes.length - voted.length,
  };

  const lengthOf = (text: string) => [...text.trim()].length;
  const lengths: BucketStat[] = LENGTH_BUCKETS.map((bucket, i) => {
    const min = i === 0 ? 0 : LENGTH_BUCKETS[i - 1].max + 1;
    const inBucket = jokes.filter((j) => {
      const len = lengthOf(j.text);
      return len >= min && len <= bucket.max;
    });
    const withVotes = inBucket.filter((j) => j.votes > 0);
    return {
      key: bucket.key,
      label: bucket.label,
      range: bucket.range,
      jokes: inBucket.length,
      votedJokes: withVotes.length,
      votes: sum(inBucket, (j) => j.votes),
      avgScore: withVotes.length ? sum(withVotes, (j) => j.score) / withVotes.length : null,
    };
  });

  const models: ModelStat[] = [...groupBy(jokes, (j) => j.model?.trim() || "")]
    .map(([model, list]) => {
      const withVotes = list.filter((j) => j.votes > 0);
      const votesN = sum(list, (j) => j.votes);
      const ups = sum(list, (j) => j.upvotes);
      return {
        key: model || "unknown",
        label: model ? prettyModel(model) : "Not recorded",
        jokes: list.length,
        votedJokes: withVotes.length,
        votes: votesN,
        upvotes: ups,
        avgScore: withVotes.length ? sum(withVotes, (j) => j.score) / withVotes.length : null,
        upShare: votesN ? ups / votesN : null,
      };
    })
    .sort((a, b) => b.jokes - a.jokes || a.label.localeCompare(b.label));

  // ---- Totals ---------------------------------------------------------------
  const seenPeople = new Set([
    ...images.map((i) => i.user_id),
    ...captions.map((c) => c.user_id),
    ...votes.map((v) => v.user_id),
  ]);
  const totals: DashboardStats["totals"] = {
    users: profilesOk ? profileResult.rows.length : seenPeople.size,
    usersSource: profilesOk ? "profiles" : "activity",
    photos: images.length,
    jokes: jokes.length,
    votes: votes.length,
    upvotes,
    downvotes,
    voters: byVoter.size,
    votedJokes: voted.length,
    laughRate: votes.length ? upvotes / votes.length : null,
    jokesPerPhoto: images.length ? jokes.length / images.length : null,
    votesPerJoke: jokes.length ? votes.length / jokes.length : null,
  };

  return {
    generatedAt: new Date(now).toISOString(),
    profiles: { ok: profilesOk, error: profileResult.error },
    totals,
    recent: {
      users: profilesOk ? profileResult.rows.filter((p) => isRecent(p.created_at)).length : null,
      photos: images.filter((i) => isRecent(i.created_at)).length,
      jokes: captions.filter((c) => isRecent(c.created_at)).length,
      votes: votes.filter((v) => isRecent(v.created_at)).length,
    },
    daily,
    heatmap,
    funniest,
    controversial,
    bestPhotos,
    crowd: { generous, critic, mostActive, topUploader, smallSample },
    verdicts,
    lengths,
    models,
  };
}
