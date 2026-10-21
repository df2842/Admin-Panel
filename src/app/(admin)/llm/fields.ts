import type { FieldSpec } from "@/components/crud/schema";
import { LIMITS } from "@/lib/domain";

/** No SQL length limit on the URL columns; keep them sane. */
const URL_MAX = 300;
const HTTPS_HINT = "Use a full https:// link, or leave it empty.";

/** Form + validation for public.llm_providers (mirrors the SQL checks). */
export const PROVIDER_FIELDS: FieldSpec[] = [
  {
    name: "name",
    label: "Name",
    kind: "text",
    required: true,
    max: LIMITS.providerName,
    placeholder: "Google (Gemini API)",
  },
  {
    name: "slug",
    label: "Slug",
    kind: "text",
    required: true,
    max: 40,
    pattern: "slug",
    normalize: "lowercase",
    mono: true,
    placeholder: "google",
    patternHint: "2–40 lowercase letters, numbers or dashes, starting with a letter or number (like google).",
    help: "Short unique id used in code.",
  },
  {
    name: "api_base_url",
    label: "API base URL",
    kind: "text",
    max: URL_MAX,
    pattern: "https",
    url: true,
    mono: true,
    inputMode: "url",
    placeholder: "https://generativelanguage.googleapis.com",
    patternHint: HTTPS_HINT,
  },
  {
    name: "docs_url",
    label: "Docs URL",
    kind: "text",
    max: URL_MAX,
    pattern: "https",
    url: true,
    mono: true,
    inputMode: "url",
    placeholder: "https://ai.google.dev/gemini-api/docs",
    patternHint: HTTPS_HINT,
  },
  {
    name: "is_active",
    label: "Active",
    kind: "checkbox",
    defaultValue: true,
    help: "Off skips every model from this provider.",
  },
];

/** Form + validation for public.llm_models; provider choices are filled in per request. */
export const MODEL_FIELDS: FieldSpec[] = [
  { name: "provider_id", label: "Provider", kind: "ref", required: true, options: [] },
  {
    name: "name",
    label: "Display name",
    kind: "text",
    required: true,
    max: LIMITS.modelName,
    placeholder: "Gemini 3.5 Flash-Lite",
  },
  {
    name: "api_model_id",
    label: "API model ID",
    kind: "text",
    required: true,
    max: 100,
    pattern: "apiModelId",
    mono: true,
    placeholder: "gemini-3.5-flash-lite",
    patternHint: "2–100 characters: letters, numbers and . _ : / - (no spaces).",
    help: "Exactly what the provider's API expects. Must be unique.",
  },
  {
    name: "priority",
    label: "Priority",
    kind: "number",
    min: 0,
    max: 1000,
    defaultValue: 100,
    help: "0–1000. Lower runs first.",
  },
  {
    name: "supports_vision",
    label: "Reads photos",
    kind: "checkbox",
    defaultValue: true,
    help: "Needed for step 1 (describe photo). Text-only models just write jokes.",
  },
  { name: "is_active", label: "Active", kind: "checkbox", defaultValue: true, help: "Off means it's skipped." },
  {
    name: "notes",
    label: "Notes",
    kind: "textarea",
    max: LIMITS.modelNotes,
    rows: 2,
    wide: true,
    placeholder: "Primary: cheapest and fastest.",
  },
];
