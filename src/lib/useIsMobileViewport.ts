"use client";

import { useSyncExternalStore } from "react";

// Mirrors Tailwind's `md` breakpoint (768px) — the same cutoff Sidebar and
// MobileNav already switch on via `hidden md:flex` / `md:hidden`, kept here
// for the handful of spots (like a placeholder string) that can't be
// expressed as a CSS class alone.
const QUERY = "(max-width: 767px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobileViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
