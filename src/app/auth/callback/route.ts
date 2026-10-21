import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { NEXT_COOKIE, safeNext, sameOriginUrl } from "@/lib/safe-next";

const NONCE_COOKIE = "google_nonce";

function toLogin(request: NextRequest, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

/** Visiting the callback directly just sends people to the login page. */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url), 303);
}

/**
 * Google Sign-In (redirect mode) POSTs here with the ID token.
 * We verify the CSRF double-submit cookie, then hand the token to Supabase,
 * which validates its signature, audience and nonce and returns a session.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const credential = form.get("credential");
  const csrfFromBody = form.get("g_csrf_token");
  const csrfFromCookie = request.cookies.get("g_csrf_token")?.value;

  if (typeof credential !== "string" || !credential) {
    return toLogin(request, "Google did not return a credential.");
  }
  if (!csrfFromBody || !csrfFromCookie || csrfFromBody !== csrfFromCookie) {
    return toLogin(
      request,
      "Sign-in request failed the CSRF check. Please try again.",
    );
  }

  const nonce = request.cookies.get(NONCE_COOKIE)?.value;
  if (!nonce) {
    return toLogin(request, "Sign-in attempt expired. Please try again.");
  }

  const destination = safeNext(request.cookies.get(NEXT_COOKIE)?.value);
  // Cookies Supabase sets go onto whichever response we end up returning.
  let response = NextResponse.redirect(sameOriginUrl(destination, request.url), 303);
  const clearFlowCookies = (res: NextResponse) => {
    res.cookies.set(NONCE_COOKIE, "", { path: "/auth/callback", maxAge: 0 });
    res.cookies.set(NEXT_COOKIE, "", { path: "/auth/callback", maxAge: 0 });
    return res;
  };
  clearFlowCookies(response);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
    nonce,
  });

  if (error) {
    return toLogin(request, error.message);
  }

  // Only superadmins keep a session here. Anyone else is signed straight back
  // out, so this app never hands a working session to an account that the
  // Caption Arena sign-in list would turn away. (Signing in once still creates
  // the profile row the owner needs to promote the first superadmin.)
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile?.is_superadmin !== true) {
    response = clearFlowCookies(toLogin(request, "Only superadmins can use the Admin Panel."));
    await supabase.auth.signOut({ scope: "local" });
    return response;
  }
  return response;
}
