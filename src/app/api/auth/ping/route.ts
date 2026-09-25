import { createClient } from "@/lib/supabase/server";

// Hit by ensureBrowserSession() when the browser's own token refresh failed.
// The proxy in front of this route refreshes the auth cookie from the
// refresh token on the way in, so by the time the browser reads the cookie
// again it holds a live session — or this says there's none left.
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return Response.json({ signedIn: !!data.user }, { headers: { "Cache-Control": "no-store" } });
}
