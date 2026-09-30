import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// Skips files that never depend on who's signed in — static assets, the
// service worker, the PWA manifest, sitemap/robots and the deploy-check
// endpoint, the fingerprint machine's API (it has no session) — so none of
// them pay for a session refresh round trip.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|robots\\.txt|sitemap\\.xml|api/build-id|api/clock/|api/chat/push-hook|fonts/|sounds/|emoji/|brand/|placeholders/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg|woff|woff2|ttf|otf)$).*)",
  ],
};
