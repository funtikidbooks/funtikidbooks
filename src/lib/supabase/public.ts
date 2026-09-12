import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// For fetching public marketing content (published projects/news/reviews,
// site settings, hero images) that every visitor sees the same way. Unlike
// lib/supabase/server.ts's createClient(), this never touches next/headers'
// cookies() — that single call is what forces a route into per-request
// dynamic rendering, so a page that only ever needs this client can be
// statically served instead of re-run on every navigation. Never use this
// for anything that depends on who's asking (auth, RLS-gated drafts) —
// reach for the cookie-aware client in server.ts for that.
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
