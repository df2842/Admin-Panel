"use client";

import { useId, useState, type FormEvent } from "react";
import { ResultLine } from "@/components/media/useAction";
import type { ActionResult } from "@/lib/media";
import {
  charCount,
  normalizeText,
  sameValues,
  validateRecord,
  type FieldSpec,
  type FormValue,
  type FormValues,
  type TextSpec,
} from "./schema";
import { useCrudAction, type Success } from "./useCrudAction";

const LABEL = "text-sm font-semibold";

function focusField(form: HTMLFormElement, name: string) {
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLElement) el.focus();
}

/** Snaps free text to a suggestion when it matches its value or label. */
function snapToOption(field: TextSpec, value: string): string {
  const needle = value.trim().toLowerCase();
  if (!needle) return value;
  const hit = field.options?.find((o) => o.value.toLowerCase() === needle || o.label.toLowerCase() === needle);
  return hit ? hit.value : value;
}

/**
 * The form for creating or editing one record, generated from field specs.
 * Errors show once a field has been left (or on submit), the first invalid
 * field gets focus on submit, and text fields count characters as you type.
 */
export default function RecordForm({
  mode,
  fields,
  initial,
  submitLabel,
  pendingLabel = "Saving…",
  cancelLabel = "Cancel",
  saveAction,
  onSaved,
  onCancel,
  autoFocus = false,
}: {
  mode: "create" | "edit";
  fields: FieldSpec[];
  initial: FormValues;
  submitLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  saveAction: (values: FormValues) => Promise<ActionResult>;
  /** Create forms reset and stay open; edit forms usually close here. */
  onSaved?: (result: Success) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const uid = useId();
  const [values, setValues] = useState<FormValues>(initial);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const { pending, result, run, clear } = useCrudAction();

  const { errors } = validateRecord(fields, values);
  const unchanged = mode === "edit" && sameValues(fields, values, initial);

  function set(name: string, value: FormValue) {
    setValues((v) => ({ ...v, [name]: value }));
    if (result) clear();
  }

  function touch(name: string) {
    setTouched((t) => (t[name] ? t : { ...t, [name]: true }));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const firstBad = fields.find((f) => errors[f.name]);
    if (firstBad) {
      setShowAll(true);
      focusField(form, firstBad.name);
      return;
    }
    if (unchanged) {
      onCancel?.();
      return;
    }
    run(
      () => saveAction(values),
      (saved) => {
        if (mode === "create") {
          setValues(initial);
          setTouched({});
          setShowAll(false);
          focusField(form, fields[0].name);
        }
        onSaved?.(saved);
      },
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field, i) => {
          const id = `${uid}-${field.name}`;
          const error = showAll || touched[field.name] ? errors[field.name] : undefined;
          return (
            <div key={field.name} className={field.wide ? "sm:col-span-2" : ""}>
              <Field
                field={field}
                id={id}
                value={values[field.name]}
                error={error}
                autoFocus={autoFocus && i === 0}
                onChange={(v) => set(field.name, v)}
                onBlur={() => {
                  if (field.kind === "combo") {
                    const current = values[field.name];
                    const snapped = snapToOption(field, typeof current === "string" ? current : "");
                    if (snapped !== current) set(field.name, snapped);
                  }
                  touch(field.name);
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="btn btn-primary btn-lg aria-disabled:cursor-wait aria-disabled:opacity-60"
          aria-disabled={pending}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-lg" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </button>
        )}
        {unchanged && <span className="text-sm text-muted">No changes yet.</span>}
        <ResultLine result={result} />
      </div>
    </form>
  );
}

function Field({
  field,
  id,
  value,
  error,
  autoFocus,
  onChange,
  onBlur,
}: {
  field: FieldSpec;
  id: string;
  value: FormValue | undefined;
  error: string | undefined;
  autoFocus: boolean;
  onChange: (value: FormValue) => void;
  onBlur: () => void;
}) {
  const helpId = field.help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
  const text = typeof value === "string" ? value : "";

  if (field.kind === "checkbox") {
    return (
      <label
        htmlFor={id}
        className="flex h-full cursor-pointer items-start gap-3 rounded-xl border-2 border-border p-3 transition hover:border-primary/60"
      >
        <input
          id={id}
          name={field.name}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          onBlur={onBlur}
          autoFocus={autoFocus}
          aria-describedby={helpId}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary"
        />
        <span className="min-w-0">
          <span className={`block ${LABEL}`}>{field.label}</span>
          {field.help && (
            <span id={helpId} className="mt-0.5 block text-xs text-muted">
              {field.help}
            </span>
          )}
        </span>
      </label>
    );
  }

  const optional = field.kind !== "number" && !field.required;
  const textField = field.kind === "text" || field.kind === "textarea" || field.kind === "combo" ? field : null;
  const count = textField ? charCount(normalizeText(textField, text)) : 0;
  const inputClass = `input ${error ? "border-danger" : ""}`;

  let control;
  if (field.kind === "ref") {
    control = (
      <select
        id={id}
        name={field.name}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`${inputClass} h-11 cursor-pointer pr-8`}
      >
        {(!field.required || text === "") && (
          <option value="">
            {field.required ? `Choose a ${field.label.toLowerCase()}…` : (field.emptyLabel ?? "None")}
          </option>
        )}
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === "number") {
    control = (
      <input
        id={id}
        name={field.name}
        type="number"
        inputMode="numeric"
        step={1}
        min={field.min}
        max={field.max}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`${inputClass} h-11 tabular-nums`}
      />
    );
  } else if (field.kind === "textarea") {
    control = (
      <textarea
        id={id}
        name={field.name}
        value={text}
        rows={field.rows ?? 3}
        maxLength={field.max * 2 + 50}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`${inputClass} h-auto resize-y py-2 leading-relaxed`}
      />
    );
  } else {
    const listId = field.kind === "combo" && field.options?.length ? `${id}-options` : undefined;
    control = (
      <>
        <input
          id={id}
          name={field.name}
          type={field.inputMode === "email" ? "email" : field.inputMode === "url" ? "url" : "text"}
          inputMode={field.inputMode}
          value={text}
          maxLength={field.max * 2 + 50}
          placeholder={field.placeholder}
          list={listId}
          autoComplete="off"
          autoCapitalize={field.mono || field.normalize ? "none" : undefined}
          spellCheck={field.mono || field.normalize ? false : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoFocus={autoFocus}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`${inputClass} h-11 ${field.mono ? "font-mono" : ""}`}
        />
        {listId && (
          <datalist id={listId}>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </datalist>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={LABEL}>
          {field.label}
          {optional && <span className="ml-1.5 text-xs font-normal text-muted">(optional)</span>}
        </label>
        {textField && (
          <span
            className={`text-xs tabular-nums ${count > textField.max ? "font-semibold text-danger" : "text-muted"}`}
            aria-hidden
          >
            {count}/{textField.max}
          </span>
        )}
      </div>
      {control}
      {error && (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      {field.help && (
        <p id={helpId} className="text-xs text-muted">
          {field.help}
        </p>
      )}
    </div>
  );
}
