/** Mirrors public.profiles (see supabase/week6-admin.sql). */
export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

export type ImageRow = {
  id: string;
  user_id: string;
  storage_path: string;
  public_url: string;
  description: string;
  created_at: string;
};

export type CaptionRow = {
  id: string;
  image_id: string;
  user_id: string;
  text: string;
  model: string | null;
  created_at: string;
};

export type VoteRow = {
  id: number;
  caption_id: string;
  user_id: string;
  value: -1 | 1;
  created_at: string;
};

/** Row of the public caption_scores view (aggregate vote totals). */
export type CaptionScore = {
  caption_id: string;
  score: number;
  upvotes: number;
  downvotes: number;
};

export type ScoredCaption = CaptionRow & {
  score: number;
  upvotes: number;
  downvotes: number;
};

export type ImageWithCaptions = ImageRow & {
  captions: ScoredCaption[];
};
