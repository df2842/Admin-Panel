"use client";

import { useState } from "react";
import { updateDescription } from "@/app/(admin)/media/actions";
import { DESCRIPTION_MAX } from "@/lib/media";
import { ResultLine, useAction } from "./useAction";

/** Editable AI description (the text Gemini writes jokes from). */
export default function DescriptionEditor({ imageId, initial }: { imageId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const { pending, result, run, clear } = useAction();

  const trimmed = value.replace(/\s+/g, " ").trim();
  const changed = trimmed !== initial.trim();
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
          <button type="button" className="btn btn-ghost" onClick={() => setValue(initial)}>
            Undo changes
          </button>
        )}
        <ResultLine result={result} />
        {!valid && trimmed.length === 0 && <p className="text-sm text-danger">The description can&apos;t be empty.</p>}
      </div>
    </form>
  );
}
