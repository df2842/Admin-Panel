import type { FieldSpec } from "@/components/crud/schema";
import { LIMITS } from "@/lib/domain";

/** Form + validation for public.allowed_signup_domains (mirrors the SQL checks). */
export const DOMAIN_FIELDS: FieldSpec[] = [
  {
    name: "domain",
    label: "Domain",
    kind: "text",
    required: true,
    max: 253,
    pattern: "domain",
    normalize: "domain",
    mono: true,
    placeholder: "columbia.edu",
    patternHint: "Just the domain, like columbia.edu (no @, no https://, no spaces).",
    help: "Sub-domains count too: columbia.edu also lets in cs.columbia.edu.",
  },
  {
    name: "note",
    label: "Note",
    kind: "text",
    max: LIMITS.accessNote,
    placeholder: "Columbia University",
  },
];

/** Form + validation for public.whitelisted_emails (stored lowercase, like the SQL check). */
export const EMAIL_FIELDS: FieldSpec[] = [
  {
    name: "email",
    label: "E-mail",
    kind: "text",
    required: true,
    max: 254,
    pattern: "email",
    normalize: "lowercase",
    mono: true,
    inputMode: "email",
    placeholder: "name@example.com",
    patternHint: "Enter a full e-mail address, like name@example.com.",
  },
  {
    name: "note",
    label: "Note",
    kind: "text",
    max: LIMITS.accessNote,
    placeholder: "Guest reviewer",
  },
];
