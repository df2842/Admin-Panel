import AdminNav from "@/components/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { displayName } from "@/lib/format";

/** The public Caption Arena app this panel administers. */
const MAIN_APP_URL = "https://hello-world-the-humor-project.vercel.app";

/**
 * Shell for every admin page. requireAdmin() redirects visitors to /login and
 * non-superadmins to /denied before anything renders.
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireAdmin();
  const name = displayName(profile);

  const account = (
    <div className="flex items-center gap-3">
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15" aria-hidden>
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
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <p className="flex items-center gap-2 px-2 py-3 text-lg font-bold">
          <span aria-hidden>🛡️</span> Admin Panel
        </p>
        <nav aria-label="Admin" className="mt-4 flex-1">
          <AdminNav variant="sidebar" />
          <a
            href={MAIN_APP_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-white/10"
          >
            <span aria-hidden>🎭</span> Open the app ↗
          </a>
        </nav>
        {account}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 bg-sidebar p-3 text-sidebar-foreground lg:hidden">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-bold">🛡️ Admin Panel</p>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-sm bg-white/15 text-sidebar-foreground hover:bg-white/25">
              Sign out
            </button>
          </form>
        </div>
        <nav aria-label="Admin">
          <AdminNav variant="bar" />
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
