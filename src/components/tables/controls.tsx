import type { ReactNode } from "react";

/**
 * Form controls for FilterBar. Plain server-rendered inputs: FilterBar
 * submits them, and its `stateKey` remounts them so default values always
 * match the URL.
 */

/** Pill-style radio group (e.g. 7d / 30d / 90d / All). */
export function Segmented({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: ReactNode; title?: string }[];
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</legend>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border-2 border-border bg-card p-1">
        {options.map((o) => (
          <label key={o.value || "default"} className="cursor-pointer" title={o.title}>
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={o.value === value}
              className="peer sr-only"
            />
            <span className="flex h-8 items-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-muted transition hover:bg-border/60 hover:text-foreground peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Labelled native select. */
export function SelectField({
  name,
  label,
  value,
  options,
  className = "",
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col ${className}`}>
      <span className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <select name={name} defaultValue={value} className="input h-11 cursor-pointer pr-8">
        {options.map((o) => (
          <option key={o.value || "default"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
