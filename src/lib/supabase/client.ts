import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Chrome throttles a hidden tab's timers down to ~once a minute, which
      // starves Realtime's 25s heartbeat — the server then drops the socket
      // without the page noticing, and chat messages stop arriving until
      // someone clicks back into the tab (staff saw a 10:59 message only at
      // 11:02). Running the heartbeat in a Web Worker keeps it on schedule
      // in the background. The worker is built from an inline Blob by
      // realtime-js itself, so no extra file or origin is involved.
      // 15s instead of the default 25s: a connection that dies silently
      // while the app is open gets noticed and replaced sooner (the
      // realtimeWatchdog handles returning from the background).
      // First reconnect attempt after 0.25s instead of 1s (a dead socket
      // found on returning to the app should come back at once), then the
      // usual stepped backoff so a real outage isn't hammered.
      realtime: {
        worker: true,
        heartbeatIntervalMs: 15000,
        reconnectAfterMs: (tries: number) => [250, 1000, 2000, 5000][tries - 1] ?? 10000,
      },
    },
  );
}

export class SessionLostError extends Error {
  constructor() {
    super("Phiên đăng nhập đã hết hạn");
    this.name = "SessionLostError";
  }
}

// Every browser-side chat query goes through this first. When supabase-js
// can't refresh its token (typical right after iOS Safari wakes a tab that
// slept for hours), it doesn't fail — it quietly sends the anon key instead,
// RLS hides every chat row, and the query "succeeds" with []. That froze
// Alice's room at 11:07 while Lalune's 15:32 messages sat in the database.
// Here a missing session is recovered through the server (the proxy
// refreshes the auth cookie on any request) or reported, never papered over.
export async function ensureBrowserSession(): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) return;

  const res = await fetch("/api/auth/ping", { cache: "no-store" }).catch(() => null);
  if (!res?.ok) throw new Error("offline");
  const body = (await res.json().catch(() => null)) as { signedIn?: boolean } | null;
  if (!body?.signedIn) throw new SessionLostError();

  const again = await supabase.auth.getSession();
  if (!again.data.session) throw new SessionLostError();
  // Realtime still holds the dead token — rejoin every channel with the new one.
  supabase.realtime.setAuth().catch(() => {});
}
