"use client";

import { useState } from "react";
import { PATTERNS } from "@/lib/domain";

type Verdict = { tone: "yes" | "no" | "hint"; text: string };

/**
 * Mirrors public.is_signup_allowed() (supabase/week7-domain.sql) against the
 * lists on this page: superadmin or whitelisted -> yes; no domains -> yes;
 * the e-mail's domain equals or is a subdomain of an allowed one -> yes.
 * (The database matches superadmins by account; here, by their profile e-mail.)
 */
function verdictFor(email: string, domains: string[], emails: string[], superadmins: string[]): Verdict | null {
  if (!email) return null;
  if (!PATTERNS.email.test(email)) {
    return { tone: "hint", text: "Type a full e-mail address, like name@columbia.edu." };
  }
  if (superadmins.includes(email)) return { tone: "yes", text: "Can sign in: superadmins always can." };
  if (emails.includes(email)) return { tone: "yes", text: "Can sign in: this e-mail is whitelisted." };
  if (domains.length === 0) return { tone: "yes", text: "Can sign in: the domain list is empty, so anyone can." };
  const host = email.split("@")[1];
  const match = domains.find((d) => host === d || host.endsWith(`.${d}`));
  if (match) return { tone: "yes", text: `Can sign in: allowed by the domain ${match}.` };
  return { tone: "no", text: `Can't sign in: ${host} isn't on the domain list and the e-mail isn't whitelisted.` };
}

const TONE = {
  yes: "text-emerald-700 dark:text-emerald-300",
  no: "text-danger",
  hint: "text-muted",
} as const;

/** "Could this person sign in?" tester for the current lists. */
export default function AccessChecker({
  domains,
  emails,
  superadmins,
}: {
  domains: string[];
  emails: string[];
  superadmins: string[];
}) {
  const [value, setValue] = useState("");
  const verdict = verdictFor(value.trim().toLowerCase(), domains, emails, superadmins);

  return (
    <div className="card p-4 sm:p-5">
      <label htmlFor="access-check" className="block text-base font-bold">
        Check an e-mail
      </label>
      <input
        id="access-check"
        type="email"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={254}
        placeholder="someone@columbia.edu"
        className="input mt-3 h-11 font-mono"
      />
      <p role="status" className={`mt-2 min-h-5 text-sm font-semibold ${verdict ? TONE[verdict.tone] : ""}`}>
        {verdict && (
          <>
            <span aria-hidden>{verdict.tone === "yes" ? "✓ " : verdict.tone === "no" ? "✕ " : ""}</span>
            {verdict.text}
          </>
        )}
      </p>
    </div>
  );
}
