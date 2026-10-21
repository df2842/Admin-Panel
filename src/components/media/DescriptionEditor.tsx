"use client";

import { useState } from "react";
import { updateDescription } from "@/app/(admin)/media/actions";
import { DESCRIPTION_MAX } from "@/lib/media";
import { ResultLine, useAction } from "./useAction";

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

/** Editable AI description (the text Gemini writes jokes from). */
export default function DescriptionEditor({ imageId, initial }: { imageId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  // When the saved text changes (e.g. a photo replace re-described it), show
  // it, unless there are unsaved edits: those are kept, with a note.
  const [saved, setSaved] = useState(initial);
  const [outdated, setOutdated] = useState(false);
  if (initial !== saved) {
    const edited = normalize(value) !== normalize(saved);
    setSaved(initial);
    if (!edited) setValue(initial);
    setOutdated(edited && normalize(value) !== normalize(initial));
  }
  const { pending, result, run, clear } = useAction();

  const trimmed = normalize(value);
  const changed = trimmed !== normalize(initial);
  const valid = trimmed.length >= 1 && trimmed.length <= DESCRIPTION_MAX;

  return (
    <form
      className="card space-y-3 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && valid) run(() => updateDescription(imageId, value));
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="description" className="text-base font-bold">
          AI description
        </label>
        <span className={`text-xs tabular-nums ${trimmed.length > DESCRIPTION_MAX ? "text-danger" : "text-muted"}`}>
          {trimmed.length}/{DESCRIPTION_MAX}
        </span>
      </div>
      <p className="text-xs text-muted">The AI writes new jokes from this text, so keep it accurate.</p>
      {outdated && changed && (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
        >
          A new description was saved. Your unsaved edits are kept; &ldquo;Undo changes&rdquo; shows the new one.
        </p>
      )}
      <textarea
        id="description"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (result) clear();
        }}
        rows={6}
        maxLength={DESCRIPTION_MAX + 200}
        className="input h-auto min-h-32 resize-y py-2 leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!changed || !valid || pending} className="btn btn-primary">
          {pending ? "Saving…" : "Save description"}
        </button>
        {changed && !pending && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setValue(initial);
              setOutdated(false);
            }}
          >
            Undo changes
          </button>
        )}
        <ResultLine result={result} />
        {!valid && trimmed.length === 0 && <p className="text-sm text-danger">The description can&apos;t be empty.</p>}
      </div>
    </form>
  );
}
