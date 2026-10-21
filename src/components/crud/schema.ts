import { PATTERNS } from "@/lib/domain";

/**
 * Declarative field specs for the CRUD kit. One spec drives three things:
 * the form the admin fills in, the live validation they see while typing,
 * and the server action's validation (which re-runs the same rules, because
 * the browser can't be trusted). Specs are plain data, so a server page can
 * pass them straight to the client components; patterns are referenced by
 * name (RegExps can't cross the server/client boundary).
 *
 * No server-only imports in here: client components import this module too.
 */

export type Option = { value: string; label: string };
export type PatternName = keyof typeof PATTERNS;

/** What a form holds while editing (numbers and ids as strings). */
export type FormValue = string | boolean;
export type FormValues = Record<string, FormValue>;

/** What gets written to the database after validation. */
export type DbValue = string | number | boolean | null;
export type DbValues = Record<string, DbValue>;

type Common = {
  /** Column name. */
  name: string;
  label: string;
  /** One short line under the field. */
  help?: string;
  /** Span both columns of the form grid. */
  wide?: boolean;
};

/** Free text. `combo` is free text with suggestions (and snaps to a suggestion's value). */
export type TextSpec = Common & {
  kind: "text" | "textarea" | "combo";
  required?: boolean;
  /** Maximum characters after whitespace is tidied, line breaks included (mirrors the SQL check). */
  max: number;
  pattern?: PatternName;
  /** Shown when `pattern` (or `url`) fails, e.g. "Like columbia.edu". */
  patternHint?: string;
  /** "lowercase" for slugs and e-mails; "domain" also drops a leading "@". */
  normalize?: "lowercase" | "domain";
  /** Must also parse as an https:// URL. */
  url?: boolean;
  placeholder?: string;
  /** Monospace input (ids, slugs, URLs). */
  mono?: boolean;
  rows?: number;
  inputMode?: "text" | "email" | "url";
  options?: Option[];
};

export type NumberSpec = Common & {
  kind: "number";
  min: number;
  max: number;
  defaultValue: number;
};

export type CheckboxSpec = Common & {
  kind: "checkbox";
  defaultValue: boolean;
};

/** A select of related rows; the value is a bigint id (positive integer). */
export type RefSpec = Common & {
  kind: "ref";
  required?: boolean;
  options: Option[];
  /** Label of the empty choice when the field is optional. */
  emptyLabel?: string;
};

export type FieldSpec = TextSpec | NumberSpec | CheckboxSpec | RefSpec;

// ---- Small parsers ---------------------------------------------------------------

/** Positive bigint id (as a JS number) or null. Accepts a number or a digit string. */
export function parseId(value: unknown): number | null {
  const s = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^[1-9]\d{0,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** Characters as Postgres char_length counts them (code points, not UTF-16 units). */
export function charCount(s: string): number {
  return Array.from(s).length;
}

function isHttpsUrl(s: string): boolean {
  try {
    const url = new URL(s);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Collapses whitespace and applies the field's normalization. Textareas keep
 * their line breaks (at most one blank line in a row); spaces are tidied per line.
 */
export function normalizeText(field: TextSpec, raw: string): string {
  let s =
    field.kind === "textarea"
      ? raw
          .split(/\r\n?|\n/)
          .map((line) => line.replace(/\s+/g, " ").trim())
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
      : raw.replace(/\s+/g, " ").trim();
  if (field.normalize === "lowercase") s = s.toLowerCase();
  if (field.normalize === "domain") s = s.toLowerCase().replace(/^@+/, "").replace(/\.+$/, "");
  return s;
}

// ---- Validation ----------------------------------------------------------------

type Parsed = { value: DbValue } | { error: string };

function asString(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (raw === undefined || raw === null) return "";
  return null;
}

function parseField(field: FieldSpec, raw: unknown): Parsed {
  switch (field.kind) {
    case "checkbox":
      return { value: raw === true || raw === "true" || raw === "on" };

    case "number": {
      const s = asString(raw)?.trim() ?? null;
      if (s === null || s === "") return { error: `${field.label} is required.` };
      if (!/^-?\d{1,7}$/.test(s)) return { error: `${field.label} must be a whole number.` };
      const n = Number(s);
      if (n < field.min || n > field.max) {
        return { error: `${field.label} must be between ${field.min} and ${field.max}.` };
      }
      return { value: n };
    }

    case "ref": {
      const s = asString(raw)?.trim() ?? null;
      const noun = field.label.toLowerCase();
      if (s === null) return { error: `Pick a ${noun} from the list.` };
      if (s === "") return field.required ? { error: `Pick a ${noun}.` } : { value: null };
      const id = parseId(s);
      // On the server the options are usually empty; the foreign key catches stale ids.
      if (id === null || (field.options.length > 0 && !field.options.some((o) => o.value === s))) {
        return { error: `Pick a ${noun} from the list.` };
      }
      return { value: id };
    }

    default: {
      const rawText = asString(raw);
      if (rawText === null) return { error: `${field.label} must be text.` };
      if (rawText.length > field.max * 4 + 200) return { error: `${field.label} is far too long.` };
      const s = normalizeText(field, rawText);
      if (!s) return field.required ? { error: `${field.label} is required.` } : { value: null };
      const length = charCount(s);
      if (length > field.max) {
        return { error: `${field.label} can be at most ${field.max} characters (it has ${length}).` };
      }
      if (field.pattern && !PATTERNS[field.pattern].test(s)) {
        return { error: field.patternHint ?? `${field.label} isn't in the right format.` };
      }
      if (field.url && !isHttpsUrl(s)) {
        return { error: field.patternHint ?? `${field.label} must be a full https:// link.` };
      }
      return { value: s };
    }
  }
}

/**
 * Validates and normalizes a whole record. `errors` is keyed by field name
 * ("_form" when the input isn't an object at all).
 */
export function validateRecord(
  fields: readonly FieldSpec[],
  input: unknown,
): { values: DbValues; errors: Record<string, string> } {
  const values: DbValues = {};
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { values, errors: { _form: "The form data was not readable. Reload the page and try again." } };
  }
  const source = input as Record<string, unknown>;
  for (const field of fields) {
    const parsed = parseField(field, Object.hasOwn(source, field.name) ? source[field.name] : undefined);
    if ("error" in parsed) errors[field.name] = parsed.error;
    else values[field.name] = parsed.value;
  }
  return { values, errors };
}

/** Server-action helper: the normalized values, or the first error message. */
export function parseRecord(
  fields: readonly FieldSpec[],
  input: unknown,
): { ok: true; values: DbValues } | { ok: false; error: string } {
  const { values, errors } = validateRecord(fields, input);
  const first = errors._form ?? fields.map((f) => errors[f.name]).find(Boolean);
  return first ? { ok: false, error: first } : { ok: true, values };
}

// ---- Form state helpers -------------------------------------------------------------

/** Form values for a new record (no row) or for editing an existing row. */
export function initialValues(fields: readonly FieldSpec[], row?: object): FormValues {
  const source = (row ?? {}) as Record<string, unknown>;
  const out: FormValues = {};
  for (const field of fields) {
    const v = source[field.name];
    switch (field.kind) {
      case "checkbox":
        out[field.name] = typeof v === "boolean" ? v : field.defaultValue;
        break;
      case "number":
        out[field.name] = typeof v === "number" ? String(v) : String(field.defaultValue);
        break;
      case "ref":
        out[field.name] =
          typeof v === "number" || typeof v === "string"
            ? String(v)
            : field.required && field.options.length === 1
              ? field.options[0].value
              : "";
        break;
      default:
        out[field.name] = typeof v === "string" ? v : "";
    }
  }
  return out;
}

/** True when two form states would save the same record. */
export function sameValues(fields: readonly FieldSpec[], a: FormValues, b: FormValues): boolean {
  return fields.every((field) => {
    const x = a[field.name];
    const y = b[field.name];
    if (field.kind === "checkbox") return Boolean(x) === Boolean(y);
    const sx = typeof x === "string" ? x : "";
    const sy = typeof y === "string" ? y : "";
    if (field.kind === "number" || field.kind === "ref") return sx.trim() === sy.trim();
    return normalizeText(field, sx) === normalizeText(field, sy);
  });
}

/** Fills in options that are only known at request time (providers, chains, flavors). */
export function withOptions(fields: readonly FieldSpec[], options: Record<string, Option[]>): FieldSpec[] {
  return fields.map((field) =>
    (field.kind === "ref" || field.kind === "combo") && options[field.name]
      ? { ...field, options: options[field.name] }
      : field,
  );
}
