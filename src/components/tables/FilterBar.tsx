"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent, type ReactNode } from "react";

/**
 * One row of filters above a table. Selects and radio pills apply as soon as
 * they change; text fields apply on Enter or the submit button. Filters live
 * in the URL (searchParams), so every view is linkable and the server does
 * the actual filtering. While the next page loads, the results keep their
 * frame at reduced opacity instead of flashing.
 *
 * Empty values are dropped from the URL, so give each control's default
 * option the value "".
 */
export default function FilterBar({
  action,
  stateKey,
  children,
  results,
  label = "Filters",
}: {
  /** Path the filters apply to, e.g. "/votes". */
  action: string;
  /** Current query string; remounts the controls when the URL changes. */
  stateKey: string;
  children: ReactNode;
  results: ReactNode;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string" && value.trim() !== "") params.set(key, value.trim());
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${action}?${qs}` : action, { scroll: false }));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    apply(e.currentTarget);
  }

  function onChange(e: FormEvent<HTMLFormElement>) {
    const t = e.target;
    if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "radio")) {
      apply(e.currentTarget);
    }
  }

  return (
    <>
      <form
        key={stateKey}
        role="search"
        aria-label={label}
        action={action}
        method="get"
        onSubmit={onSubmit}
        onChange={onChange}
        className="flex flex-wrap items-end gap-3 sm:gap-4"
      >
        {children}
        <span aria-live="polite" className={`self-center text-xs text-muted ${pending ? "" : "sr-only"}`}>
          {pending ? "Loading…" : ""}
        </span>
      </form>
      <div aria-busy={pending} className={`transition-opacity duration-200 ${pending ? "opacity-55" : ""}`}>
        {results}
      </div>
    </>
  );
}
