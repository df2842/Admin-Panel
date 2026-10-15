import type { ReactNode } from "react";

/** Friendly placeholder for a chart or list with no data yet. */
export default function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl bg-background/70 px-4 py-10 text-center">
      <span aria-hidden className="text-3xl">
        {icon}
      </span>
      <p className="mt-1 font-semibold">{title}</p>
      {children ? <p className="max-w-sm text-sm text-muted">{children}</p> : null}
    </div>
  );
}
