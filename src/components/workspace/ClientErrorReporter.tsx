"use client";

import { useEffect } from "react";
import { hydrationDiff } from "@/lib/hydrationProbe";

// Sends uncaught errors from a staff member's screen to /api/client-error,
// so a broken screen gets noticed without waiting for someone to report
// it. The same error is sent once per page load, at most 10 in total.
const sent = new Set<string>();

export function reportClientError(message: string, stack?: string | null) {
  if (typeof window === "undefined" || sent.size >= 10 || sent.has(message)) return;
  sent.add(message);
  const body = JSON.stringify({ message, stack: stack ?? null, url: window.location.pathname });
  try {
    if (!navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) {
      fetch("/api/client-error", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // Reporting must never cause an error of its own.
  }
}

// A hydration mismatch also sends which text differed (lib/hydrationProbe.ts).
// Listening from the moment this module loads, not from an effect: React
// reports the mismatch while hydrating, before any effect has run.
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    if (!/#418|#425|hydrat/i.test(e.message ?? "")) return;
    try {
      const diff = hydrationDiff();
      if (diff) reportClientError(`Hydration diff ${window.location.pathname}`, diff);
    } catch {
      // Diagnosis only — never an error of its own.
    }
  });
}

export function ClientErrorReporter() {
  useEffect(() => {
    function onError(e: ErrorEvent) {
      // Cross-origin script errors arrive with no detail — nothing to act on.
      if (!e.message || e.message === "Script error.") return;
      reportClientError(e.message, e.error instanceof Error ? e.error.stack : null);
    }
    function onRejection(e: PromiseRejectionEvent) {
      const reason = e.reason;
      const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : null;
      // Aborted/network fetches are expected on flaky connections, not bugs.
      if (!message || /abort|network|failed to fetch|load failed/i.test(message)) return;
      reportClientError(message, reason instanceof Error ? reason.stack : null);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
