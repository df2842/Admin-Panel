import type { FieldSpec } from "@/components/crud/schema";
import { APP_MAX_TERMS } from "@/lib/config-data";
import { LIMITS } from "@/lib/domain";

/** Form + validation for public.terms (mirrors the SQL checks). */
export const TERM_FIELDS: FieldSpec[] = [
  {
    name: "term",
    label: "Term",
    kind: "text",
    required: true,
    max: LIMITS.term,
    placeholder: "Misdirection",
    help: "Must be unique (ignoring upper/lower case).",
  },
  {
    name: "is_active",
    label: "Active",
    kind: "checkbox",
    defaultValue: true,
    help: `The first ${APP_MAX_TERMS} active terms (A–Z) go to the joke step.`,
  },
  {
    name: "definition",
    label: "Definition",
    kind: "textarea",
    required: true,
    max: LIMITS.termDefinition,
    rows: 3,
    wide: true,
    placeholder: "Set up an expectation, then pay it off with something unexpected.",
  },
  {
    name: "example",
    label: "Example joke",
    kind: "textarea",
    max: LIMITS.termExample,
    rows: 2,
    wide: true,
    placeholder: "A one-line joke that uses the technique.",
  },
];
