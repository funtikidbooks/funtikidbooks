"use client";

import { useEffect } from "react";

// Keeps the public site's pages ready in the Vercel edge that serves
// Vietnam (Hong Kong, hkg1 — checked from a Vietnamese connection). Every
// deploy empties that cache, and a page nobody has opened for a while drops
// out of it too; the next visitor then waits for it to be fetched again.
// A server-side warm-up can't help — it would come from Singapore or the US
// and warm their edges instead — but the studio's own browsers are in
// Vietnam: one of them, quietly in the background, opens every page in the
// sitemap after each deploy and at most every 30 minutes.

const KEY = "funti-public-warm";
const EVERY_MS = 30 * 60 * 1000;

export function PublicPageWarmer() {
  useEffect(() => {
    let stopped = false;
    // A while after the workspace opens, so it never competes with it.
    const timer = setTimeout(
      async () => {
        if (document.visibilityState !== "visible") return;
        try {
          const build = ((await (await fetch("/api/build-id", { cache: "no-store" })).json()) as { id?: string }).id ?? "";
          let last: { build?: string; at?: number } | null = null;
          try {
            last = JSON.parse(localStorage.getItem(KEY) ?? "null");
          } catch {
            last = null;
          }
          if (last?.build === build && Date.now() - (last.at ?? 0) < EVERY_MS) return;
          // Claimed before starting, so another open tab skips this round.
          try {
            localStorage.setItem(KEY, JSON.stringify({ build, at: Date.now() }));
          } catch {
            // private mode — warms anyway, just can't tell other tabs
          }
          const sitemap = await (await fetch("/sitemap.xml", { cache: "no-store" })).text();
          const paths = [...sitemap.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)?<\/loc>/g)].map((m) => m[1] || "/").slice(0, 80);
          for (const path of paths) {
            if (stopped) return;
            // Like a first-time visitor: no cookies, past this browser's own cache.
            await fetch(path, { cache: "no-store", credentials: "omit", priority: "low" } as RequestInit).catch(() => {});
            await new Promise((r) => setTimeout(r, 300));
          }
        } catch {
          // Best effort — a missed round just means the next visitor warms it.
        }
      },
      15000 + Math.random() * 30000,
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  return null;
}
