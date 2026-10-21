"use client";

import { useOptimistic, useTransition } from "react";
import type { ActionResult } from "@/lib/media";
import { OFFLINE } from "./useCrudAction";

/**
 * On/off switch for an `is_active` column. Flips instantly (optimistic) and
 * snaps back if the server action fails.
 */
export default function ActiveToggle({
  active,
  itemName,
  toggleAction,
  onResult,
}: {
  active: boolean;
  /** For screen readers: the switch is named "Active: <itemName>". */
  itemName: string;
  toggleAction: (next: boolean) => Promise<ActionResult>;
  onResult?: (result: ActionResult) => void;
}) {
  const [on, setOn] = useOptimistic(active);
  const [pending, startTransition] = useTransition();

  function flip() {
    const next = !on;
    startTransition(async () => {
      setOn(next);
      let result: ActionResult;
      try {
        result = await toggleAction(next);
      } catch {
        result = OFFLINE;
      }
      onResult?.(result);
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-busy={pending}
      onClick={() => {
        if (!pending) flip();
      }}
      title={on ? "Turn off" : "Turn on"}
      className={`btn w-28 justify-start border-2 ${
        on
          ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:text-emerald-200"
          : "border-border bg-card text-muted"
      } hover:border-primary`}
    >
      <span
        aria-hidden
        className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-600" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-4.5" : "left-0.5"}`}
        />
      </span>
      {/* The name stays "Active: <item>" (a switch's label shouldn't change); aria-checked says on/off. */}
      <span aria-hidden>{on ? "Active" : "Off"}</span>
      <span className="sr-only">Active: {itemName}</span>
    </button>
  );
}
