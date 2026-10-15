import Link from "next/link";

/** Error card for failed loads. Never throws, so a page always renders. */
export function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="card border-danger/40 p-6">
      <p className="flex items-center gap-2 text-lg font-bold text-danger">
        <span aria-hidden>⚠️</span> {title}
      </p>
      <p className="mt-2 break-words text-sm text-muted">{message}</p>
      <p className="mt-4 text-sm text-muted">Reload the page to try again.</p>
    </div>
  );
}

/** One-line success / warning banner with an optional dismiss link. */
export function Banner({
  tone,
  children,
  dismissHref,
}: {
  tone: "success" | "warning";
  children: React.ReactNode;
  dismissHref?: string;
}) {
  const colors =
    tone === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
      : "border-accent/60 bg-accent/10 text-foreground";
  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-sm font-semibold ${colors}`}
    >
      <span>{children}</span>
      {dismissHref && (
        <Link href={dismissHref} className="btn btn-ghost btn-sm" aria-label="Dismiss">
          ✕
        </Link>
      )}
    </div>
  );
}
