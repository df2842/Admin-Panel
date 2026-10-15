"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/media";

/** Next.js signals redirect()/notFound() from a server action with a special error. */
function isNavigationError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"));
}

/**
 * Runs a media server action inside a transition and keeps its last result,
 * so every button can show a pending state and a clear success/error line.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (action: () => Promise<ActionResult>, onSuccess?: () => void) => {
    setResult(null);
    startTransition(async () => {
      try {
        const next = await action();
        if (!next) return;
        setResult(next);
        if (next.ok) onSuccess?.();
      } catch (err) {
        if (isNavigationError(err)) throw err; // let Next.js follow the redirect
        setResult({ ok: false, error: "Could not reach the server. Check your connection and try again." });
      }
    });
  };

  return { pending, result, run, clear: () => setResult(null) };
}

/** Inline result line under a form or button. */
export function ResultLine({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p role="status" className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
      ✓ {result.message}
    </p>
  ) : (
    <p role="alert" className="text-sm font-semibold text-danger">
      {result.error}
    </p>
  );
}
