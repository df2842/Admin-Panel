/** Formatting helpers. All dates render in UTC so server and client agree. */

export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return (
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
  );
}

/** "3h ago", "2d ago". `now` is passed in so server renders stay deterministic per request. */
export function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d}d ago`;
  return formatDate(iso);
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function displayName(p: { full_name?: string | null; email?: string | null } | null | undefined): string {
  return p?.full_name || p?.email || "Unknown user";
}

const STORAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/`;
const IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'><rect width='4' height='3' fill='%23d6d3cc'/></svg>";

/**
 * images.public_url is written by users, so only trust URLs that point into
 * this project's own "images" storage bucket; anything else (an external
 * link someone slipped in) is replaced by a neutral placeholder.
 */
export function trustedImageUrl(url: string | null | undefined): string {
  return typeof url === "string" && url.startsWith(STORAGE_PREFIX) && !url.includes("..")
    ? url
    : IMAGE_PLACEHOLDER;
}
