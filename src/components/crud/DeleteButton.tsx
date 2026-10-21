"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ResultLine } from "@/components/media/useAction";
import type { ActionResult } from "@/lib/media";
import { useCrudAction, type Success } from "./useCrudAction";

/**
 * Two-step delete. The first click opens an inline confirmation and moves
 * focus to its Cancel button; Cancel or Escape closes it and puts focus back
 * on the Delete button. A failed delete (e.g. still in use) keeps the
 * confirmation open with the reason.
 */
export default function DeleteButton({
  itemName,
  confirmText,
  deleteAction,
  onDeleted,
  onOpenChange,
}: {
  /** For screen readers: "Delete <itemName>". */
  itemName: string;
  confirmText: string;
  deleteAction: () => Promise<ActionResult>;
  /** Called after a successful delete; the row is about to disappear, so move focus here. */
  onDeleted?: (result: Success) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const questionId = useId();
  const [open, setOpen] = useState(false);
  const { pending, result, run, clear } = useCrudAction();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      cancelRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  function toggle(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) clear();
  }

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary hover:border-danger hover:text-danger"
        onClick={() => toggle(true)}
      >
        <span aria-hidden>🗑️</span> Delete<span className="sr-only"> {itemName}</span>
      </button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby={questionId}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) {
          e.stopPropagation();
          toggle(false);
        }
      }}
      className="w-full space-y-3 rounded-2xl border-2 border-danger/50 bg-card p-3 sm:max-w-md"
    >
      <p id={questionId} className="text-sm font-semibold">
        {confirmText}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-disabled={pending}
          className="btn btn-danger aria-disabled:cursor-wait aria-disabled:opacity-60"
          onClick={() => {
            if (!pending) run(deleteAction, onDeleted);
          }}
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          ref={cancelRef}
          type="button"
          aria-disabled={pending}
          className="btn btn-secondary aria-disabled:opacity-60"
          onClick={() => {
            if (!pending) toggle(false);
          }}
        >
          Cancel
        </button>
      </div>
      <ResultLine result={result} />
    </div>
  );
}
