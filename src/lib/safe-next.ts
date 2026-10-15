/**
 * Validates a post-login redirect target. Only same-site relative paths are
 * allowed, so `?next=` can never send someone to another website.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return fallback;
  // Must be a single-slash relative path with no control characters or backslashes.
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }
  try {
    const url = new URL(value, "https://example.invalid");
    if (url.origin !== "https://example.invalid") return fallback;
    // Check the *normalized* path: "/./evil.com" style dot segments can
    // collapse into a protocol-relative "//evil.com".
    const path = url.pathname;
    if (path.startsWith("//") || path.includes("\\")) return fallback;
    // Never bounce back into the auth flow itself.
    if (path === "/login" || path.startsWith("/login/") || path.startsWith("/auth")) return fallback;
    return path + url.search;
  } catch {
    return fallback;
  }
}

/** Builds an absolute same-origin URL for a redirect, or falls back to /. */
export function sameOriginUrl(target: string, base: string): URL {
  const url = new URL(target, base);
  return url.origin === new URL(base).origin ? url : new URL("/", base);
}

export const NEXT_COOKIE = "post_login_next";
