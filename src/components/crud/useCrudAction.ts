"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/media";

export type Success = Extract<ActionResult, { ok: true }>;

/** Next.js signals redirect()/notFound() from a server action with a special error. */
function isNavigationError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"));
}

export const OFFLINE: ActionResult = {
  ok: false,
  error: "Could not reach the server. Check your connection and try again.",
};

/**
 * Runs a server action inside a transition and keeps its last result. Like
 * media/useAction, but the success callback receives the result so a parent
 * can show the message after the form that ran it has closed.
 */
export function useCrudAction() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (action: () => Promise<ActionResult>, onSuccess?: (result: Success) => void) => {
    setResult(null);
    startTransition(async () => {
      try {
        const next = await action();
        if (!next) return;
        setResult(next);
        if (next.ok) onSuccess?.(next);
      } catch (err) {
        if (isNavigationError(err)) throw err;
        setResult(OFFLINE);
      }
    });
  };

  return { pending, result, run, clear: () => setResult(null) };
}
