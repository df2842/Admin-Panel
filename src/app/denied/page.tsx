import { redirect } from "next/navigation";
import { getAdminState } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access denied" };

/**
 * Shown to signed-in users who are not superadmins. Still behind the login
 * wall (the proxy sends visitors to /login first).
 */
export default async function DeniedPage() {
  const { user, profile, setupMissing } = await getAdminState();
  if (!user) redirect("/login");
  if (profile?.is_superadmin) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center bg-sidebar px-6 py-16">
      <div className="w-full max-w-md rounded-3xl bg-card p-8 text-center shadow-2xl">
        <p className="text-4xl" aria-hidden>
          🚫
        </p>
        <h1 className="mt-3 text-2xl font-bold">Superadmins only</h1>
        <p className="mt-2 text-sm text-muted">
          You&apos;re signed in as <strong className="text-foreground">{user.email}</strong>, which isn&apos;t a
          superadmin.
        </p>

        {setupMissing && (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-xs text-amber-900">
            The <code>profiles</code> table doesn&apos;t exist yet. Run <code>supabase/week6-admin.sql</code> in the
            Supabase SQL Editor, then reload.
          </p>
        )}

        <form action="/auth/signout" method="post" className="mt-6">
          <button type="submit" className="btn btn-primary btn-lg w-full">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
