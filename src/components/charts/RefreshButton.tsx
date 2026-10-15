"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Re-runs the server render so every stat is recomputed from fresh rows. */
export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <span aria-hidden className={pending ? "animate-spin" : ""}>
        ↻
      </span>
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
