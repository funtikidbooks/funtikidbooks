"use client";

import { useEffect, useRef } from "react";
import { THEME_EVENT, useTheme } from "@/lib/useTheme";
import { updateMyTheme } from "@/lib/actions/profile";

function currentDomTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

// Ties the workspace's dark/light choice to the signed-in account instead
// of only the browser's localStorage — browsers can and do wipe local
// storage on their own (privacy settings, Safari's ITP purge for inactive
// sites, "clear on exit"...), which showed up to staff as the theme
// randomly reverting to light with no action on their part. The
// server-remembered choice from profiles.theme reconciles on mount (server
// wins over whatever the no-flash script guessed from localStorage), and
// every later toggle is echoed back to the server. Renders nothing.
//
// Reads the DOM directly rather than the `theme` from useTheme()'s React
// state on purpose: the reconcile effect below and the toggle-listener
// effect both fire in the same commit right after mount, before a
// setTheme() call inside the first one has flowed through a re-render —
// a version that persisted the *state* value here ended up reading that
// stale pre-reconciliation theme and writing it straight back to the
// server, silently undoing the correction it had just made.
export function ThemeSync({ serverTheme }: { serverTheme: "light" | "dark" | null }) {
  const { setTheme } = useTheme();
  const reconciledRef = useRef(false);

  useEffect(() => {
    if (serverTheme && serverTheme !== currentDomTheme()) setTheme(serverTheme);
    reconciledRef.current = true;
  }, [serverTheme, setTheme]);

  useEffect(() => {
    function handleThemeChange() {
      // Ignore the change our own reconcile effect above may have just
      // triggered — only persist a change once reconciliation has run.
      if (!reconciledRef.current) return;
      updateMyTheme(currentDomTheme()).catch(() => {});
    }
    window.addEventListener(THEME_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_EVENT, handleThemeChange);
  }, []);

  return null;
}
