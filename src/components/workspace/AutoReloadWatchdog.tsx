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
    // A tab (worst: the iPad/iPhone home-screen app) can sit for days on an
    // old deploy — old JS then talks to a server that has moved on (renamed
    // Server Actions, changed queries), which showed up as sends stuck on
    // "Đang gửi…". Compare the baked build id with the live one and reload
    // once it is safe (nothing half-typed in a field).
    const builtWith = process.env.NEXT_PUBLIC_BUILD_ID;
    async function checkForNewDeploy() {
      if (!builtWith) return;
      try {
        const res = await fetch("/api/build-id", { cache: "no-store" });
        const { id } = (await res.json()) as { id: string | null };
        if (!id || id === builtWith) return;
        const el = document.activeElement;
        const typing =
          (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.value.trim().length > 0;
        if (!typing) tryAutoReload();
      } catch {
        // offline / transient — try again on the next tick
      }
    }
    function handleVisible() {
      if (document.visibilityState === "visible") checkForNewDeploy();
    }
    document.addEventListener("visibilitychange", handleVisible);
    const interval = setInterval(checkForNewDeploy, 5 * 60 * 1000);
    checkForNewDeploy();
    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      clearInterval(interval);
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return null;
}
