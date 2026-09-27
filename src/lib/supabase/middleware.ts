import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Verified locally against the project's ES256 public key when possible
  // (getClaims also refreshes an expired session and rewrites the cookie,
  // which is this proxy's main job); falls back to the auth server on
  // anything unexpected — see verifiedUser() in lib/supabase/server.ts.
  let user = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    user = !error && typeof data?.claims?.sub === "string" && data.claims.sub.length > 0;
  } catch {
    // fall through
  }
  if (!user) {
    const {
      data: { user: serverUser },
    } = await supabase.auth.getUser();
    user = !!serverUser;
  }

  const path = request.nextUrl.pathname;

  const requiresAuth =
    path === "/workspace" ||
    path.startsWith("/workspace/") ||
    path === "/quan-tri" ||
    path.startsWith("/quan-tri/");

  if (!user && requiresAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/dang-nhap";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && path === "/dang-nhap") {
    const url = request.nextUrl.clone();
    url.pathname = "/workspace";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
