"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ActionResult } from "@/lib/media";
import RecordForm from "./RecordForm";
import { initialValues, type FieldSpec, type FormValues } from "./schema";

/**
 * "+ New …" button that opens an inline create form. The form stays open
 * after a successful add (cleared, focus back on the first field) so several
 * records can be added in a row; Close returns focus to the button.
 */
export default function CreatePanel({
  fields,
  noun,
  createAction,
  title,
  help,
  defaultOpen = false,
  disabledReason,
}: {
  fields: FieldSpec[];
  /** "term", "provider", "domain"… */
  noun: string;
  createAction: (values: FormValues) => Promise<ActionResult>;
  title?: string;
  help?: string;
  defaultOpen?: boolean;
  /** Shown instead of the form when creating isn't possible yet. */
  disabledReason?: string;
}) {
  const headingId = useId();
  const [open, setOpen] = useState(defaultOpen && !disabledReason);
  // Only grab focus when the admin opened the form, not when it starts open.
  const [openedByUser, setOpenedByUser] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) wasOpen.current = true;
    else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          ref={triggerRef}
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!!disabledReason}
          onClick={() => {
            setOpen(true);
            setOpenedByUser(true);
          }}
        >
          <span aria-hidden>＋</span> New {noun}
        </button>
        {disabledReason && <p className="text-sm text-muted">{disabledReason}</p>}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="card border-2 border-primary/40 p-4 sm:p-5">
      <h3 id={headingId} className="text-lg font-bold">
        {title ?? `New ${noun}`}
      </h3>
      {help && <p className="mt-1 text-sm text-muted">{help}</p>}
      <div className="mt-4">
        <RecordForm
          mode="create"
          fields={fields}
          initial={initialValues(fields)}
          submitLabel={`Add ${noun}`}
          pendingLabel="Adding…"
          cancelLabel="Close"
          saveAction={createAction}
          onCancel={() => setOpen(false)}
          autoFocus={openedByUser}
        />
      </div>
    </section>
  );
}
