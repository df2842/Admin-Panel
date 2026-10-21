/**
 * Week 7 domain model types. Mirrors supabase/week7-domain.sql exactly.
 * bigint identity ids arrive from PostgREST as JS numbers.
 */

export type LlmProvider = {
  id: number;
  name: string;
  slug: string;
  api_base_url: string | null;
  docs_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LlmModel = {
  id: number;
  provider_id: number;
  name: string;
  api_model_id: string;
  /** Lower runs first; Caption Arena falls back down this order. */
  priority: number;
  supports_vision: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PromptChain = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PromptChainStep = {
  id: number;
  chain_id: number;
  step_order: number;
  name: string;
  purpose: string | null;
  input_type: "image" | "text";
  output_type: "text" | "json";
  /** May contain {{placeholders}} the app fills in at run time. */
  system_prompt: string;
  user_prompt: string;
  /** numeric(3,2) comes back as a number. */
  temperature: number;
  created_at: string;
  updated_at: string;
};

export type PromptChainMix = {
  id: number;
  chain_id: number;
  flavor: string;
  label: string;
  instruction: string;
  /** 0-100 relative weight; a "Mixed bag" batch splits in proportion. */
  weight: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Term = {
  id: number;
  term: string;
  definition: string;
  example: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AiGenerationExample = {
  id: number;
  chain_id: number | null;
  image_description: string;
  caption: string;
  flavor: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type GenerationRequest = {
  id: string;
  user_id: string;
  chain_id: number | null;
  image_id: string | null;
  /** "describe" = an admin re-describing a photo (Replace photo, "Re-describe with AI"). */
  kind: "upload" | "more_jokes" | "describe";
  style: string | null;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  caption_count: number;
  started_at: string;
  finished_at: string | null;
};

export type LlmResponse = {
  id: number;
  request_id: string;
  step_order: number;
  step_name: string;
  model_id: number | null;
  api_model_id: string;
  attempt: number;
  status: "ok" | "error" | "empty";
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  prompt: string | null;
  response_text: string | null;
  error: string | null;
  created_at: string;
};

export type AllowedSignupDomain = {
  id: number;
  domain: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WhitelistedEmail = {
  id: number;
  email: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Validation shared by forms and server actions (mirror the SQL checks). */
export const PATTERNS = {
  slug: /^[a-z0-9][a-z0-9-]{1,39}$/,
  apiModelId: /^[A-Za-z0-9._:/-]{2,100}$/,
  domain: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  https: /^https:\/\//,
} as const;

export const LIMITS = {
  providerName: 80,
  modelName: 80,
  modelNotes: 500,
  term: 60,
  termDefinition: 300,
  termExample: 200,
  exampleDescription: 600,
  exampleCaption: 200,
  accessNote: 200,
} as const;
