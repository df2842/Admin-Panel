import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { NEXT_COOKIE, safeNext } from "@/lib/safe-next";

const NONCE_COOKIE = "google_nonce";

/**
 * Issues a nonce for the Google sign-in flow. The raw value is stored in a
 * cookie; Google embeds a SHA-256 hash of it in the ID token so the callback
 * can prove the token was minted for this login attempt.
 *
 * Also remembers where to send the user after sign-in (?next=), because the
 * Google redirect must land on /auth/callback with no query parameters.
 */
export async function GET(request: NextRequest) {
  const nonce = randomBytes(32).toString("base64url");
  const hashedNonce = createHash("sha256").update(nonce).digest("hex");

  // Google posts the token to /auth/callback from accounts.google.com, so
  // these cookies must be allowed on a cross-site request.
  const cookie = {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/auth/callback",
    maxAge: 60 * 10,
  };

  const response = NextResponse.json({ nonce: hashedNonce }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(NONCE_COOKIE, nonce, cookie);
  response.cookies.set(NEXT_COOKIE, safeNext(request.nextUrl.searchParams.get("next")), cookie);
  return response;
}
