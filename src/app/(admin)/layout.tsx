import AdminNav, { MobileNav } from "@/components/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { displayName } from "@/lib/format";

/** The public Caption Arena app this panel administers. */
const MAIN_APP_URL = "https://hello-world-the-humor-project.vercel.app";

/**
 * Shell for every admin page. requireAdmin() redirects visitors to /login and
 * non-superadmins to /denied before anything renders.
 *
 * Large screens: a full-height sidebar (brand, grouped sections that scroll
 * when the window is short, account box pinned at the bottom).
 * Small screens: a compact top bar with a "Menu" button.
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireAdmin();
  const name = displayName(profile);

  const account = (
    <div className="flex items-center gap-3">
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full" />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15" aria-hidden>
          🙂
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-[11px] text-sidebar-foreground/60">Superadmin</p>
      </div>
      <form action="/auth/signout" method="post">
        <button type="submit" className="btn btn-sm bg-white/15 text-sidebar-foreground hover:bg-white/25">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <p className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-5 text-lg font-bold">
          <span aria-hidden>🛡️</span> Admin Panel
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          <AdminNav appUrl={MAIN_APP_URL} />
        </div>
        <div className="shrink-0 border-t border-white/10 px-4 py-3">{account}</div>
      </aside>

      {/* Phone / tablet top bar */}
      <MobileNav appUrl={MAIN_APP_URL} account={account} />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
