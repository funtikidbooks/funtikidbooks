"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/lib/useTheme";
import { updateMyTheme } from "@/lib/actions/profile";

// Ties the workspace's dark/light choice to the signed-in account instead
// of only the browser's localStorage — browsers can and do wipe local
// storage on their own (privacy settings, Safari's ITP purge for inactive
// sites, "clear on exit"...), which showed up to staff as the theme
// randomly reverting to light with no action on their part. The
// server-remembered choice from profiles.theme reconciles on mount (server
// wins over whatever the no-flash script guessed from localStorage), and
// every later toggle is echoed back to the server. Renders nothing.
export function ThemeSync({ serverTheme }: { serverTheme: "light" | "dark" | null }) {
  const { theme, setTheme } = useTheme();
  const reconciledRef = useRef(false);
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (serverTheme && serverTheme !== theme) setTheme(serverTheme);
    lastSyncedRef.current = serverTheme ?? theme;
    reconciledRef.current = true;
    // Only ever run once, right after mount — reconciling against whatever
    // serverTheme/theme were at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!reconciledRef.current || lastSyncedRef.current === theme) return;
    lastSyncedRef.current = theme;
    updateMyTheme(theme).catch(() => {});
  }, [theme]);

  return null;
}
