"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "funti-theme";
export const THEME_EVENT = "funti-theme-change";

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function getSnapshot(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function getServerSnapshot(): "light" | "dark" {
  return "light";
}

// Reads the DOM attribute the no-flash <head> script in the root layout
// already applied, rather than duplicating that state in React.
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Stable across renders on purpose — ThemeSync's reconcile effect depends
  // on setTheme, and an unmemoized version handed it a fresh function
  // identity on every theme change. That re-ran the effect right after every
  // single toggle, which re-applied the (by then stale) serverTheme prop and
  // silently flipped the click straight back — clicking the switch looked
  // like it did nothing at all.
  const setTheme = useCallback((next: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (e.g. private browsing) — theme just won't persist
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  // Reads the DOM directly rather than closing over the `theme` value above
  // — keeps this stable too (only depends on the now-stable setTheme).
  const toggleTheme = useCallback(() => {
    setTheme(getSnapshot() === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}

// Dark mode is an internal workspace/admin preference, not something the
// public marketing site or the next person on a shared computer should
// inherit — called right as the sign-out form submits so the browser goes
// back to the default light look the moment the session ends. Leaves
// profiles.theme in the database untouched, so ThemeSync still restores the
// same person's dark choice the next time they log back in.
export function resetThemeOnSignOut() {
  document.documentElement.setAttribute("data-theme", "light");
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable — nothing to clear
  }
}
