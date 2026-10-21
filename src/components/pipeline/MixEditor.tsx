"use client";

import { useId, useRef, useState } from "react";
import { updateMixWeights } from "@/app/(admin)/prompt-chains/actions";
import { ResultLine, useAction } from "@/components/media/useAction";
import { MIX_WEIGHT_MAX, MIX_WEIGHT_MIN, parseWeight, splitBatch } from "./pipeline-utils";

export type MixRowView = {
  id: number;
  flavor: string;
  label: string;
  instruction: string;
  weight: number;
};

/**
 * Prompt chain mix editor: one row per humor flavor with a 0-100 weight
 * (number field + slider kept in sync) and a live preview of how a "Mixed
 * bag" batch splits across flavors (largest-remainder rounding). Only the
 * rows whose weight changed are sent to the server action.
 */
export default function MixEditor({
  chainId,
  rows,
  batchSize,
}: {
  chainId: number;
  rows: MixRowView[];
  batchSize: number;
}) {
  const baseId = useId();
  // Unsaved edits as typed (strings so a field can be briefly empty); rows
  // without an entry show their saved weight.
  const [draft, setDraft] = useState<Record<number, string>>({});
  // The form-level problem is only announced after a Save attempt, not while typing.
  const [attempted, setAttempted] = useState(false);
  const { pending, result, run, clear } = useAction();
  const saveRef = useRef<HTMLButtonElement>(null);

  const values = rows.map((r) => draft[r.id] ?? String(r.weight));
  const parsed = values.map(parseWeight);
  const allValid = parsed.every((w) => w !== null);
  const weights = parsed.map((w, i) => w ?? rows[i].weight);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const changes = rows.flatMap((r, i) =>
    parsed[i] !== null && parsed[i] !== r.weight ? [{ id: r.id, weight: parsed[i] }] : [],
  );
  const changed = changes.length > 0;
  const hasPositive = allValid && total > 0;
  const canSave = changed && allValid && hasPositive && !pending;

  const shares = splitBatch(
    rows.map((r, i) => ({ key: r.id, weight: allValid ? weights[i] : 0 })),
    batchSize,
  );
  const preview = rows.flatMap((r) => Array.from({ length: shares.get(r.id) ?? 0 }, () => r.label));

  const setWeight = (row: MixRowView, value: string) => {
    setDraft((d) => {
      const next = { ...d };
      // Typing the saved weight back drops the draft, so a later refresh can't revive it as a stale change.
      if (value === String(row.weight)) delete next[row.id];
      else next[row.id] = value;
      return next;
    });
    setAttempted(false);
    if (result) clear();
  };

  const problem = !allValid
    ? `Weights must be whole numbers from ${MIX_WEIGHT_MIN} to ${MIX_WEIGHT_MAX}.`
    : !hasPositive
      ? "At least one flavor needs a weight above 0, or Mixed bag batches would have nothing to draw from."
      : null;

  return (
    <form
      className="card space-y-5 p-4 sm:p-6"
      aria-labelledby={`${baseId}-title`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) {
          if (problem) setAttempted(true);
          return;
        }
        const sent = changes;
        run(
          () => updateMixWeights(chainId, sent),
          // Drop the saved drafts so the refreshed weights show through. Edits typed
          // while saving are kept, and a failed save keeps everything for a retry.
          () =>
            setDraft((d) => {
              const next = { ...d };
              for (const c of sent) if (parseWeight(next[c.id] ?? "") === c.weight) delete next[c.id];
              return next;
            }),
        );
      }}
    >
      <div>
        <h2 id={`${baseId}-title`} className="text-xl font-bold">
          Humor mix
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          When someone picks <span className="font-semibold text-foreground">🎲 Mixed bag</span>, each batch of{" "}
          {batchSize} jokes is split across these flavors in proportion to their weights. Weights are relative (they
          don&apos;t need to add up to 100); 0 means the flavor is never used.
        </p>
      </div>

      <ul className="space-y-3">
        {rows.map((r, i) => {
          const inputId = `${baseId}-weight-${r.id}`;
          const shareId = `${baseId}-share-${r.id}`;
          const invalid = parsed[i] === null;
          const edited = !invalid && parsed[i] !== r.weight;
          const jokes = shares.get(r.id) ?? 0;
          const pct = allValid && total > 0 ? Math.round((weights[i] / total) * 100) : null;
          return (
            <li
              key={r.id}
              className={`grid gap-4 rounded-2xl border-2 p-4 transition sm:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] sm:items-center ${
                invalid ? "border-danger/60" : edited ? "border-accent" : "border-border"
              }`}
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <label htmlFor={inputId} className="text-base font-bold">
                    {r.label}
                  </label>
                  <code className="rounded bg-border/60 px-1.5 py-0.5 font-mono text-[11px] text-muted">{r.flavor}</code>
                  {edited && <span className="badge bg-accent text-accent-foreground">Unsaved</span>}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Asks for <span className="italic">“{r.instruction}”</span>
                </p>
              </div>

              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={MIX_WEIGHT_MIN}
                    max={MIX_WEIGHT_MAX}
                    step={1}
                    value={weights[i]}
                    onChange={(e) => setWeight(r, e.target.value)}
                    aria-label={`${r.label} weight slider`}
                    aria-describedby={shareId}
                    className={`h-8 min-w-0 flex-1 cursor-pointer accent-primary ${invalid ? "opacity-40" : ""}`}
                  />
                  <input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    min={MIX_WEIGHT_MIN}
                    max={MIX_WEIGHT_MAX}
                    step={1}
                    value={values[i]}
                    onChange={(e) => setWeight(r, e.target.value)}
                    aria-invalid={invalid}
                    aria-describedby={shareId}
                    className={`input h-11 w-20 shrink-0 text-right text-base font-semibold tabular-nums ${invalid ? "border-danger" : ""}`}
                  />
                </div>
                <p id={shareId} className="text-sm">
                  {invalid ? (
                    <span className="font-semibold text-danger">Enter a whole number from 0 to 100.</span>
                  ) : jokes > 0 ? (
                    <>
                      <span className="font-semibold">
                        {jokes} of {batchSize} jokes
                      </span>
                      <span className="text-muted"> · {pct}% of the mix</span>
                    </>
                  ) : weights[i] === 0 ? (
                    <span className="text-muted">Not used</span>
                  ) : (
                    <span className="text-muted" title="Its share is smaller than one joke, so rounding gives its slot to a bigger flavor.">
                      0 of {batchSize} jokes · {pct}% of the mix (rounds down)
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-2xl bg-background p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          A Mixed bag batch of {batchSize}
          {changed && allValid ? " (with your unsaved changes)" : ""}
        </p>
        {/* Silent while a field is invalid, so retyping a weight doesn't announce "no flavors". */}
        <p className="sr-only" aria-live="polite">
          {!allValid ? "" : preview.length > 0 ? `Batch of ${batchSize}: ${preview.join(", ")}.` : "No flavors would be used."}
        </p>
        {preview.length > 0 ? (
          <ol aria-hidden className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {preview.map((label, i) => (
              <li
                key={i}
                className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-border/70 text-[11px] text-muted">
                  {i + 1}
                </span>
                <span className="truncate">{label}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p aria-hidden className="mt-2 text-sm text-muted">
            No flavors would be used.
          </p>
        )}
        <p className="mt-2 text-xs text-muted">
          Total weight {allValid ? total : "—"}. Leftover jokes after rounding go to the largest remainders; ties go
          to the flavor listed first.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          ref={saveRef}
          type="submit"
          aria-disabled={!canSave}
          className="btn btn-primary btn-lg aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save weights"}
        </button>
        {(changed || !allValid) && !pending && (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setDraft({});
              setAttempted(false);
              clear();
              saveRef.current?.focus();
            }}
          >
            Undo changes
          </button>
        )}
        {/* Invalid fields show their own message, so the form-level one waits for a Save
            attempt; the new key re-inserts it as an alert so screen readers announce it. */}
        {problem && (attempted || allValid) ? (
          <p
            key={attempted ? "alert" : "hint"}
            role={attempted ? "alert" : undefined}
            className="text-sm font-semibold text-danger"
          >
            {problem}
          </p>
        ) : result ? (
          <ResultLine result={result} />
        ) : changed && !pending ? (
          <p className="text-sm text-muted">
            {changes.length} unsaved change{changes.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>
    </form>
  );
}
