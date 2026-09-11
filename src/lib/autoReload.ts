// Shared by the global stale-chunk watchdog and the error.tsx/global-error.tsx
// boundaries below. A workspace tab is meant to sit open all day — when a
// new deploy ships while it's open, the next lazy-loaded chunk 404s and
// used to leave a blank white screen until someone thought to hit refresh.
// The cooldown guard stops a genuinely broken deploy from reload-looping
// forever — after one attempt within the window, callers fall back to a
// manual "Tải lại trang" button instead of retrying silently again.

export const STALE_CHUNK_RE =
  /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

const RELOAD_GUARD_KEY = "funti-auto-reload-at";
const RELOAD_COOLDOWN_MS = 15000;

export function tryAutoReload(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode, etc.) — reload once anyway,
    // just without the loop guard.
  }
  window.location.reload();
  return true;
}
