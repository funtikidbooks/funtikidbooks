"use client";

import { useSyncExternalStore } from "react";

// Only the sections the director actually wants in the installed iPhone app
// — everything else stays reachable from a regular browser tab (and from
// the iPad app, which keeps the full nav), just not from the iPhone
// home-screen icon. Shared between Sidebar and MobileNav so the two nav
// lists can't drift apart.
export const STANDALONE_ALLOWED_HREFS = new Set([
  "/workspace",
  "/workspace/hop",
  "/workspace/lich",
  "/workspace/cham-cong",
]);

function subscribe(callback: () => void) {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

// Standalone display mode — opened from "Add to Home Screen" rather than in
// ordinary Safari/Chrome chrome — AND on an iPhone specifically. iPadOS
// Safari reports a desktop Mac user agent by default (has since iPadOS 13),
// so "iPhone" in the UA is the one reliable way left to tell an iPhone apart
// from an iPad — an iPad installed the same way keeps the full nav.
function getSnapshot(): boolean {
  const isIphone = /iPhone/.test(window.navigator.userAgent);
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
  return isIphone && (iosStandalone || mediaStandalone);
}

function getServerSnapshot(): boolean {
  return false;
}

export function useShowsIphoneAppNav() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
