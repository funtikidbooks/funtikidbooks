"use client";

import { useEffect } from "react";
import { STALE_CHUNK_RE, tryAutoReload } from "@/lib/autoReload";

// Catches the failure mode React's own error boundaries can't: a stale
// chunk load rejected from an event handler or a background fetch never
// throws during render, so it never reaches error.tsx — it just surfaces
// as an unhandled rejection (or a window "error" event for a <script>/module
// load failure) while the rest of the page looks fine but the click that
// triggered it silently did nothing. Reload once and the tab picks up the
// new deploy on its own, no one needs to notice or ask.
export function AutoReloadWatchdog() {
  useEffect(() => {
    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const msg = String(reason?.message ?? reason ?? "");
      if (STALE_CHUNK_RE.test(msg)) tryAutoReload();
    }
    function handleError(event: ErrorEvent) {
      const msg = String(event.message ?? event.error?.message ?? "");
      if (STALE_CHUNK_RE.test(msg)) tryAutoReload();
    }
    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return null;
}
