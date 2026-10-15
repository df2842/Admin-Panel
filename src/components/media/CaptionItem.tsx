"use client";

import { useState } from "react";
import { deleteCaption, updateCaption } from "@/app/(admin)/media/actions";
import { signed } from "@/lib/format";
import { CAPTION_MAX } from "@/lib/media";
import { ResultLine, useAction } from "./useAction";

export type CaptionView = {
  id: string;
  text: string;
  model: string;
  author: string;
  created: string;
  upvotes: number;
  downvotes: number;
  score: number;
  isTop: boolean;
};

function scoreClass(score: number) {
  if (score > 0) return "bg-(--div-pos) text-white";
  if (score < 0) return "bg-(--div-neg) text-white";
  return "bg-border text-foreground";
}

/** One joke: text, vote counts, inline edit and a two-step delete. */
export default function CaptionItem({ caption, index }: { caption: CaptionView; index: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(caption.text);
  const [confirming, setConfirming] = useState(false);
  const save = useAction();
  const remove = useAction();

  const clean = draft.replace(/\s+/g, " ").trim();
  const valid = clean.length >= 1 && clean.length <= CAPTION_MAX;
  const busy = save.pending || remove.pending;

  return (
    <li className={`rounded-2xl border-2 p-4 ${caption.isTop ? "border-accent" : "border-border"} bg-card`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-border/70 text-xs font-bold text-muted sm:grid">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valid) return;
                if (clean === caption.text) {
                  setEditing(false);
                  return;
                }
                save.run(
                  () => updateCaption(caption.id, draft),
                  () => setEditing(false),
                );
              }}
            >
              <label htmlFor={`joke-${caption.id}`} className="sr-only">
                Joke text
              </label>
              <textarea
                id={`joke-${caption.id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={CAPTION_MAX + 50}
                autoFocus
                className="input h-auto resize-y py-2 text-base"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" disabled={!valid || busy} className="btn btn-primary">
                  {save.pending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditing(false);
                    setDraft(caption.text);
                    save.clear();
                  }}
                >
                  Cancel
                </button>
                <span className={`text-xs tabular-nums ${valid ? "text-muted" : "text-danger"}`}>
                  {clean.length}/{CAPTION_MAX}
                </span>
              </div>
            </form>
          ) : (
            <p className="text-base font-medium leading-snug break-words">
              {caption.isTop && (
                <span className="badge mr-2 bg-accent align-middle text-accent-foreground">🏆 Top</span>
              )}
              {caption.text}
            </p>
          )}

          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="badge bg-border/70 text-foreground">{caption.model}</span>
            <span>by {caption.author}</span>
            <span>{caption.created}</span>
          </p>
          <div className="mt-2">
            <ResultLine result={remove.result ?? save.result} />
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:items-end">
          <div className="flex items-center gap-2 text-sm font-semibold tabular-nums">
            <span title="Upvotes" className="rounded-lg bg-border/50 px-2 py-1">
              👍 {caption.upvotes}
            </span>
            <span title="Downvotes" className="rounded-lg bg-border/50 px-2 py-1">
              👎 {caption.downvotes}
            </span>
            <span title="Net score" className={`badge h-7 px-2.5 text-xs ${scoreClass(caption.score)}`}>
              {signed(caption.score)}
            </span>
          </div>

          {!editing &&
            (confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-danger">Delete this joke and its votes?</span>
                <button
                  type="button"
                  disabled={busy}
                  className="btn btn-danger"
                  onClick={() => remove.run(() => deleteCaption(caption.id))}
                >
                  {remove.pending ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn btn-secondary"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDraft(caption.text);
                    setEditing(true);
                    save.clear();
                  }}
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  className="btn btn-secondary hover:border-danger hover:text-danger"
                  onClick={() => {
                    setConfirming(true);
                    remove.clear();
                  }}
                >
                  🗑️ Delete
                </button>
              </div>
            ))}
        </div>
      </div>
    </li>
  );
}
