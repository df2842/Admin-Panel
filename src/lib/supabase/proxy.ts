import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext, sameOriginUrl } from "@/lib/safe-next";

/** The only routes reachable without signing in. Everything else is walled. */
function isPublic(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/auth/");
}

/**
 * Runs on every request. Refreshes the Supabase session cookie, then enforces
 * the admin wall:
 *   1. not signed in        -> /login (API routes get 401)
 *   2. signed in, not admin -> /denied (API routes get 403)
 * Pages, server actions and RLS policies all re-check; this is the outer gate.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() validates the token with Supabase; never trust getSession() here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // Carry refreshed auth cookies over to any redirect we return.
  const redirect = (url: URL) => {
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (isPublic(pathname)) {
    if (user && pathname === "/login") {
      return redirect(sameOriginUrl(safeNext(request.nextUrl.searchParams.get("next")), request.url));
    }
    return response;
  }

  if (!user) {
    if (isApi) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return redirect(url);
  }

  if (pathname === "/denied") return response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_superadmin !== true) {
    if (isApi) return NextResponse.json({ error: "Superadmins only." }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = "/denied";
    url.search = "";
    return redirect(url);
  }

  return response;
}
