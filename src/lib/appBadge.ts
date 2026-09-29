// The number on the Funti app icon — Windows taskbar, Mac Dock, iPad/phone
// home screen — once the workspace is installed as an app. The open page
// sets the exact unread count; sw.js bumps the same stored number for a
// message that arrives while no Funti window is in view (see sw.js).
// Both sides use this one Cache Storage slot, which pages and the service
// worker can each read and write.
const BADGE_CACHE = "funti-badge";
const BADGE_KEY = "/__funti-badge-count";

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function setAppUnreadBadge(count: number) {
  const nav = navigator as BadgeNavigator;
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
  if (typeof caches === "undefined") return;
  caches
    .open(BADGE_CACHE)
    .then((cache) => cache.put(BADGE_KEY, new Response(String(Math.max(0, count)))))
    .catch(() => {});
}
