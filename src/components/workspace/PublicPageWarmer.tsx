"use client";

import { useEffect } from "react";

// Keeps the public site's pages ready in the Vercel edge that serves
// Vietnam (Hong Kong, hkg1 — checked from a Vietnamese connection). Every
// deploy empties that cache, and a page nobody has opened for a while drops
// out of it too; the next visitor then waits for it to be fetched again.
// A server-side warm-up can't help — it would come from Singapore or the US
// and warm their edges instead — but the studio's own browsers are in
// Vietnam: one of them, quietly in the background, opens every page in the
// sitemap after each deploy and at most every 30 minutes. The workspace
// stays open all day, so it looks for a new deploy every 5 minutes.

const KEY = "funti-public-warm";
const WARM_EVERY_MS = 30 * 60 * 1000;
const CHECK_EVERY_MS = 5 * 60 * 1000;

// Runs in a background tab too (most of the day the workspace sits behind
// Photoshop): the fetches are tiny and a hidden tab's 5-minute timer still fires.
async function warmIfDue(isStopped: () => boolean) {
  const build = ((await (await fetch("/api/build-id", { cache: "no-store" })).json()) as { id?: string }).id ?? "";
  let last: { build?: string; at?: number } | null = null;
  try {
    last = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    last = null;
  }
  if (last?.build === build && Date.now() - (last.at ?? 0) < WARM_EVERY_MS) return;
  // Claimed before starting, so another open tab skips this round.
  try {
    localStorage.setItem(KEY, JSON.stringify({ build, at: Date.now() }));
  } catch {
    // private mode — warms anyway, just can't tell other tabs
  }
  const sitemap = await (await fetch("/sitemap.xml", { cache: "no-store" })).text();
  const paths = [...sitemap.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)?<\/loc>/g)].map((m) => m[1] || "/").slice(0, 80);
  let freshHits = 0;
  for (const [i, path] of paths.entries()) {
    if (isStopped()) return;
    // Like a first-time visitor: no cookies, past this browser's own cache.
    const res = await fetch(path, { cache: "no-store", credentials: "omit", priority: "low" } as RequestInit).catch(() => null);
    // The first pages already cached within the last 20 minutes: someone
    // else's browser has just done this round — leave it to them.
    if (res?.headers.get("x-vercel-cache") === "HIT" && Number(res.headers.get("age") ?? Infinity) < 20 * 60) freshHits++;
    if (i === 1 && freshHits === 2) return;
    await new Promise((r) => setTimeout(r, 300));
  }
}

export function PublicPageWarmer() {
  useEffect(() => {
    let stopped = false;
    let running = false;
    const run = () => {
      if (running || stopped) return;
      running = true;
      warmIfDue(() => stopped)
        .catch(() => {
          // Best effort — a missed round just means the next visitor warms it.
        })
        .finally(() => {
          running = false;
        });
    };
    // A while after the workspace opens, so it never competes with it; the
    // random part spreads several people's checks apart.
    const first = setTimeout(run, 15000 + Math.random() * 30000);
    const every = setInterval(run, CHECK_EVERY_MS + Math.random() * 60000);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  return null;
}
