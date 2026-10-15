import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Small server-safe building blocks for the read-only data views
 * (Users, Votes). No hooks, no client JS.
 */

/* ---- Page header --------------------------------------------------------- */

export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </header>
  );
}

/* ---- Avatar -------------------------------------------------------------- */

const AVATAR_SIZES = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-20 w-20 text-2xl" } as const;

function initials(name: string): string {
  const parts = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({ src, name, size = "md" }: { src?: string | null; name: string; size?: keyof typeof AVATAR_SIZES }) {
  const cls = `${AVATAR_SIZES[size]} shrink-0 rounded-full`;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" className={`${cls} bg-border object-cover`} />;
  }
  return (
    <span aria-hidden className={`${cls} grid place-items-center bg-border font-bold text-muted`}>
      {initials(name)}
    </span>
  );
}

/* ---- Stat tiles ---------------------------------------------------------- */

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">{children}</div>;
}

export function StatTile({ label, value, sub, children }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card min-w-0 p-3 sm:p-5">
      <p className="text-xs font-medium leading-tight text-muted sm:text-sm">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-[11px] leading-snug text-muted sm:text-xs">{sub}</p>}
      {children}
    </div>
  );
}

/**
 * Up/down split bar (diverging pair: blue = up, red = down) with a 2px
 * surface gap between the two fills. Counts are always printed beside it,
 * so color is never the only signal.
 */
export function SplitBar({ up, down }: { up: number; down: number }) {
  const total = up + down;
  if (total === 0) {
    return <div className="mt-3 h-2 rounded-full" style={{ background: "var(--div-mid)" }} aria-hidden />;
  }
  return (
    <div
      className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full"
      role="img"
      aria-label={`${up} upvotes, ${down} downvotes`}
      title={`👍 ${up} · 👎 ${down}`}
    >
      {up > 0 && <div className="rounded-full" style={{ flexGrow: up, background: "var(--div-pos)" }} />}
      {down > 0 && <div className="rounded-full" style={{ flexGrow: down, background: "var(--div-neg)" }} />}
    </div>
  );
}

/* ---- Badges -------------------------------------------------------------- */

export function VoteBadge({ value }: { value: number }) {
  const up = value > 0;
  return (
    <span
      className="badge whitespace-nowrap border text-xs text-foreground"
      style={{
        background: `color-mix(in oklab, var(${up ? "--div-pos" : "--div-neg"}) 14%, transparent)`,
        borderColor: `color-mix(in oklab, var(${up ? "--div-pos" : "--div-neg"}) 45%, transparent)`,
      }}
    >
      <span aria-hidden>{up ? "👍" : "👎"}</span>
      {up ? "Up" : "Down"}
    </span>
  );
}

export function AdminBadge() {
  return <span className="badge whitespace-nowrap bg-accent text-accent-foreground">🛡️ Superadmin</span>;
}

/* ---- Tables -------------------------------------------------------------- */

/** Card that scrolls its table horizontally on small screens. */
export function TableCard({ children, minWidth = 720, caption }: { children: ReactNode; minWidth?: number; caption?: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          {children}
        </table>
      </div>
    </div>
  );
}

export const TH =
  "whitespace-nowrap border-b border-border bg-background/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted";
export const TD = "border-b border-border px-4 py-3 align-middle";
export const NUM = "text-right tabular-nums";

/* ---- Thumbnail ----------------------------------------------------------- */

export function Thumb({ href, src, alt, size = 56 }: { href: string; src: string | null; alt: string; size?: number }) {
  return (
    <Link
      href={href}
      className="block shrink-0 overflow-hidden rounded-lg border border-border bg-border transition hover:ring-2 hover:ring-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      style={{ width: size, height: size }}
      title="Open photo"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center text-lg" aria-label={alt}>
          🖼️
        </span>
      )}
    </Link>
  );
}

/* ---- Notices ------------------------------------------------------------- */

export function ErrorCard({ title = "Couldn't load this data", message }: { title?: string; message: string }) {
  return (
    <div role="alert" className="card mb-6 border-danger/50 p-5">
      <p className="font-semibold text-danger">⚠️ {title}</p>
      <p className="mt-1 break-words text-sm text-muted">{message}</p>
      <p className="mt-2 text-xs text-muted">Refresh to try again. If it keeps happening, check the Supabase project.</p>
    </div>
  );
}

export function SetupNotice() {
  return (
    <div role="status" className="card mb-6 border-accent p-5">
      <p className="font-semibold">🛠️ The profiles table is missing</p>
      <p className="mt-1 text-sm text-muted">
        Run <code className="rounded bg-border px-1.5 py-0.5 font-mono text-xs">supabase/week6-admin.sql</code> in the
        Supabase SQL Editor to add names, emails and avatars. Until then, people are shown by short user id.
      </p>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <p className="text-4xl" aria-hidden>
        {icon}
      </p>
      <p className="mt-3 text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 flex flex-col items-center gap-4 text-sm text-muted">{children}</div>}
    </div>
  );
}

/* ---- Pagination ---------------------------------------------------------- */

export function Pagination({
  page,
  totalPages,
  hrefFor,
  summary,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  summary: ReactNode;
}) {
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted">{summary}</p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className="btn btn-secondary">
              ← Newer
            </Link>
          ) : (
            <span className="btn btn-secondary pointer-events-none opacity-40" aria-disabled>
              ← Newer
            </span>
          )}
          <span className="px-2 text-sm tabular-nums text-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={hrefFor(page + 1)} className="btn btn-secondary">
              Older →
            </Link>
          ) : (
            <span className="btn btn-secondary pointer-events-none opacity-40" aria-disabled>
              Older →
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
