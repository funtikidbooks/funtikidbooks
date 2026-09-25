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
      realtime: { worker: true },
    },
  );
}
