import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AccessRole, Database } from "@/lib/types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — the proxy refreshes the
            // session cookie on the next request, so this is safe to ignore.
          }
        },
      },
    },
  );
}

// Every action file across the app defined its own byte-for-byte identical
// requireUser() — createClient() + auth.getUser(), throw if not signed in.
// auth.getUser() deliberately makes a real network round trip to Supabase's
// auth server to revalidate the JWT (unlike getSession(), which just trusts
// the cookie), so calling it once per action added up fast: a single cold
// load of a workspace page runs several server actions back to back (e.g.
// workspace/layout.tsx's unread-count, pending-document, and check-in
// lookups, then the chat page's own channel/profile fetch), each paying
// for its own auth round trip on top of the others — a real, measurable
// slice of why a cold app relaunch felt slow before anything even
// rendered. `cache()` memoizes this per request (a fresh request — page
// load or a single server action invocation from the client — always gets
// its own real check; nothing is cached *across* requests), so however
// many of these run back-to-back within one request now share a single
// auth round trip instead of one each. Each action file's own requireUser
// now just re-exports this.
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const user = await verifiedUser(supabase);
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
});

// Who's signed in, verified without a network round trip when possible:
// the project signs session JWTs with an asymmetric key (ES256), so
// getClaims() checks the signature locally against the cached public key
// (refreshing an expired session first, same as getUser()). Anything
// unexpected — no claims, an error, a missing `sub` — falls back to the
// old auth-server check, so this can only ever be faster, never lock
// anyone out. Code here only reads id, email and user_metadata, all of
// which are claims in the token.
export async function verifiedUser(supabase: SupabaseClient<Database>): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!error && claims && typeof claims.sub === "string" && claims.sub) {
      return {
        id: claims.sub,
        email: typeof claims.email === "string" ? claims.email : undefined,
        user_metadata: (claims.user_metadata as User["user_metadata"]) ?? {},
        app_metadata: (claims.app_metadata as User["app_metadata"]) ?? {},
        aud: typeof claims.aud === "string" ? claims.aud : "authenticated",
        created_at: "",
      } as User;
    }
  } catch {
    // fall through to the auth-server check
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Same dedup as requireUser() above, but for the public marketing site's
// two independent per-request checks that both need to tolerate an
// anonymous visitor instead of throwing: the layout's header
// (isAuthenticated/memberHref) and each page's inline-editor-role gate
// (canEdit). Before this, an anonymous page load paid for the
// auth.getUser() round trip AND the profiles lookup twice over — once per
// caller — even though neither caller needs anything the other didn't
// already fetch.
export const getViewer = cache(async (): Promise<{ userId: string; accessRole: AccessRole } | null> => {
  const supabase = await createClient();
  const user = await verifiedUser(supabase);
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role")
    .eq("id", user.id)
    .maybeSingle();
  return { userId: user.id, accessRole: (profile?.access_role as AccessRole | undefined) ?? "staff" };
});
