"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";

type GoogleId = {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

/**
 * Renders the official Sign in with Google button in redirect mode.
 * Google POSTs the ID token straight to /auth/callback on this origin.
 */
export default function GoogleSignIn({ clientId, next }: { clientId: string; next?: string }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const render = useCallback(async () => {
    const google = window.google?.accounts.id;
    const parent = buttonRef.current;
    if (!google || !parent) return;

    try {
      const query = next ? `?next=${encodeURIComponent(next)}` : "";
      const res = await fetch(`/auth/nonce${query}`, { cache: "no-store" });
      const { nonce } = (await res.json()) as { nonce: string };

      google.initialize({
        client_id: clientId,
        ux_mode: "redirect",
        login_uri: `${window.location.origin}/auth/callback`,
        nonce,
        context: "signin",
      });
      google.renderButton(parent, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        width: 280,
      });
      setReady(true);
    } catch {
      setError("Could not start Google sign-in. Please reload and try again.");
    }
  }, [clientId, next]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* onReady fires after load and again on every remount, even if the
          script is already cached, so the button always renders. */}
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => void render()}
      />
      <div ref={buttonRef} className="min-h-11" />
      {!ready && !error && (
        <p className="text-sm text-muted">Loading Google sign-in…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
