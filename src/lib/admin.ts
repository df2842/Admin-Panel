import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AdminContext = {
  supabase: Supabase;
  user: { id: string; email: string | null };
  profile: Profile;
};

/** PostgREST codes for "that table doesn't exist" (migration not run yet). */
const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST200"]);

/**
 * Looks up the signed-in user and their profile without redirecting.
 * `setupMissing` is true when the week6-admin.sql migration hasn't been run.
 */
export async function getAdminState() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, setupMissing: false };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, is_superadmin, created_at, last_sign_in_at")
    .eq("id", user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    profile: (data as Profile | null) ?? null,
    setupMissing: !!error && MISSING_TABLE.has(error.code ?? ""),
  };
}

/**
 * Gate for every admin page, route handler and server action. Redirects
 * visitors to /login and signed-in non-admins to /denied. Row level security
 * enforces the same rule inside the database, so this is defense in depth.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const { supabase, user, profile } = await getAdminState();
  if (!user) redirect("/login");
  if (!profile?.is_superadmin) redirect("/denied");
  return { supabase, user: { id: user.id, email: user.email ?? null }, profile };
}

/**
 * Same check for server actions and route handlers, which should return an
 * error instead of redirecting.
 */
export async function checkAdmin(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; error: string; status: 401 | 403 }
> {
  const { supabase, user, profile } = await getAdminState();
  if (!user) return { ok: false, error: "Sign in required.", status: 401 };
  if (!profile?.is_superadmin) return { ok: false, error: "Superadmins only.", status: 403 };
  return { ok: true, ctx: { supabase, user: { id: user.id, email: user.email ?? null }, profile } };
}
