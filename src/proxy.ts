import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// Only where being signed in matters to the server: the workspace and Quản
// trị (sign-in redirect, and refreshing the session for their server
// components), the sign-in page, and the API. Not the public site — its
// pages are static and work out who's viewing in the browser (ViewerProvider);
// a Proxy runs as a Node function in sin1 *before* the CDN cache, so every
// customer page view used to go Hong Kong edge → Singapore function → back,
// and after a quiet spell waited on that function waking up (0.6–1.4s).
// The API minus what has no session: the deploy check, the fingerprint
// machine, the chat push hook and the push delivery ack.
export const config = {
  matcher: ["/workspace/:path*", "/quan-tri/:path*", "/dang-nhap", "/api/((?!build-id|clock/|chat/push-hook|push/ack).*)"],
};
