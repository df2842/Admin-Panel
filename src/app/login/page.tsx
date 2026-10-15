import { headers } from "next/headers";
import GoogleSignIn from "@/components/GoogleSignIn";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Sign in" };

/** The stable production domain; always registered with Google. */
const PRODUCTION_HOST = "admin-panel-the-humor-project.vercel.app";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next: rawNext } = await searchParams;
  const next = rawNext ? safeNext(rawNext) : undefined;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const host = (await headers()).get("host") ?? "";
  const onPreviewHost = host.endsWith(".vercel.app") && host !== PRODUCTION_HOST;

  return (
    <main className="flex flex-1 items-center justify-center bg-sidebar px-6 py-16">
      <div className="w-full max-w-sm rounded-3xl bg-card p-8 text-center shadow-2xl">
        <p className="text-4xl" aria-hidden>
          🛡️
        </p>
        <h1 className="mt-3 text-2xl font-bold">Admin Panel</h1>
        <p className="mt-1 text-sm text-muted">Superadmins only.</p>

        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-6">
          {clientId ? (
            <GoogleSignIn clientId={clientId} next={next} />
          ) : (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable sign-in.
            </p>
          )}
        </div>

        {onPreviewHost && (
          <p className="mt-6 text-xs text-muted">
            Button not loading?{" "}
            <a
              href={`https://${PRODUCTION_HOST}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="font-semibold text-primary underline"
            >
              Use the main admin site
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
