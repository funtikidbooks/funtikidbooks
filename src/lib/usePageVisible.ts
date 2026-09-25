"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  window.addEventListener("focus", callback);
  window.addEventListener("blur", callback);
  return () => {
    document.removeEventListener("visibilitychange", callback);
    window.removeEventListener("focus", callback);
    window.removeEventListener("blur", callback);
  };
}

// True while the tab is on screen and focused — i.e. the person can actually
// see what's rendered. Chat uses it to decide whether a new message counts
// as "seen" (read receipts, unread badges) instead of just "rendered into a
// background tab nobody is looking at".
export function usePageVisible() {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState === "visible" && document.hasFocus(),
    () => true,
  );
}
