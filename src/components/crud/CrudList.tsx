"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ResultLine } from "@/components/media/useAction";
import type { ActionResult } from "@/lib/media";
import ActiveToggle from "./ActiveToggle";
import DeleteButton from "./DeleteButton";
import RecordForm from "./RecordForm";
import type { FieldSpec, FormValues } from "./schema";

/** One record as the list shows it. `view` is rendered on the server. */
export type CrudRow = {
  id: number;
  /** Short name used in confirmations and screen-reader labels. */
  name: string;
  /** Starting values for the edit form (see initialValues). */
  values: FormValues;
  view: ReactNode;
  /** Current is_active; only used when the list has a toggleAction. */
  active?: boolean;
  /** Overrides the default delete confirmation. */
  deleteWarning?: string;
};

type Actions = {
  updateAction: (id: number, values: FormValues) => Promise<ActionResult>;
  deleteAction: (id: number) => Promise<ActionResult>;
  toggleAction?: (id: number, active: boolean) => Promise<ActionResult>;
};

/**
 * Inline-editable list of records: each row shows its server-rendered view
 * with Active / Edit / Delete controls, and Edit swaps the row for a form.
 * After a delete, focus moves to the list's status line (the row is gone).
 */
export default function CrudList({
  rows,
  fields,
  noun,
  label,
  empty,
  ...actions
}: {
  rows: CrudRow[];
  fields: FieldSpec[];
  /** "term", "model"… */
  noun: string;
  /** Accessible name of the list, e.g. "Terms". */
  label: string;
  /** Shown when there are no rows. */
  empty?: ReactNode;
} & Actions) {
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-3">
      {/* Stays focusable while empty (sr-only, not display:none) so focus can land before it fills. */}
      <div ref={statusRef} tabIndex={-1} className={`outline-none ${notice ? "" : "sr-only"}`}>
        {notice && <ResultLine result={notice} />}
      </div>
      {rows.length === 0 ? (
        empty
      ) : (
        <ul aria-label={label} className="space-y-3">
          {rows.map((row) => (
            <CrudItem
              key={row.id}
              row={row}
              fields={fields}
              noun={noun}
              {...actions}
              onDeleted={(result) => {
                setNotice(result);
                statusRef.current?.focus();
              }}
              onActivity={() => setNotice(null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CrudItem({
  row,
  fields,
  noun,
  updateAction,
  deleteAction,
  toggleAction,
  onDeleted,
  onActivity,
}: {
  row: CrudRow;
  fields: FieldSpec[];
  noun: string;
  onDeleted: (result: ActionResult) => void;
  onActivity: () => void;
} & Actions) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<ActionResult | null>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Closing the edit form (saved or cancelled) puts focus back on Edit.
  useEffect(() => {
    if (editing) wasEditing.current = true;
    else if (wasEditing.current) {
      wasEditing.current = false;
      editRef.current?.focus();
    }
  }, [editing]);

  const inactive = toggleAction && row.active === false;

  if (editing) {
    return (
      <li className="card border-2 border-primary/40 p-4 sm:p-5">
        <h3 className="mb-4 text-base font-bold">
          Edit {noun}: <span className="font-semibold text-muted">{row.name}</span>
        </h3>
        <RecordForm
          mode="edit"
          fields={fields}
          initial={row.values}
          submitLabel="Save changes"
          saveAction={(values) => updateAction(row.id, values)}
          onSaved={(result) => {
            setMessage(result);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          autoFocus
        />
      </li>
    );
  }

  return (
    <li className={`card p-4 sm:p-5 ${inactive ? "bg-background" : ""}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="min-w-0 flex-1 break-words">{row.view}</div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          {!confirming && toggleAction && (
            <ActiveToggle
              active={row.active ?? false}
              itemName={row.name}
              toggleAction={(next) => toggleAction(row.id, next)}
              onResult={(result) => setMessage(result)}
            />
          )}
          {!confirming && (
            <button
              ref={editRef}
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setMessage(null);
                onActivity();
                setEditing(true);
              }}
            >
              <span aria-hidden>✏️</span> Edit<span className="sr-only"> {row.name}</span>
            </button>
          )}
          <DeleteButton
            itemName={row.name}
            confirmText={row.deleteWarning ?? `Delete the ${noun} “${row.name}”? This can't be undone.`}
            deleteAction={() => deleteAction(row.id)}
            onDeleted={onDeleted}
            onOpenChange={(open) => {
              setConfirming(open);
              if (open) {
                setMessage(null);
                onActivity();
              }
            }}
          />
        </div>
      </div>
      {message && (
        <div className="mt-3">
          <ResultLine result={message} />
        </div>
      )}
    </li>
  );
}
