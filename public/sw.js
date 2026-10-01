// Minimal service worker whose only job is Web Push delivery for the
// workspace chat — no offline caching, so it can't make the site feel stale.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The browser expired or rotated this device's push subscription — often
// with the app closed. Without saving the new one the device silently
// stops receiving notifications until someone happens to reopen the app,
// so re-subscribe (same server key) and tell the site right away.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription || null;
      let sub = event.newSubscription || null;
      if (!sub) {
        const key = old && old.options && old.options.applicationServerKey;
        if (!key) return;
        sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      const json = sub.toJSON();
      await fetch("/api/push/resubscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldEndpoint: old ? old.endpoint : null, endpoint: json.endpoint, keys: json.keys }),
      });
    })().catch(() => {}),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const title = payload.title || "Tin nhắn mới";
  const url = payload.url || "/workspace";
  const receivedAt = Date.now();
  event.waitUntil(
    Promise.all([
      bumpAppBadge().catch(() => {}),
      showMessageNotification(title, url, payload),
      ackDelivery(payload, receivedAt).catch(() => {}),
    ]),
  );
});

// Tells the server this device got the push and how long after it was sent
// (payload.sentAt) — Quản trị → Thông báo trên máy shows each device's real
// delay from these. Runs beside showing the notification, never before it.
async function ackDelivery(payload, receivedAt) {
  if (!payload.sentAt) return;
  const sub = await self.registration.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint, sentAt: payload.sentAt, receivedAt }),
  });
}

// The unread number on the installed app's icon (Windows taskbar, Dock,
// home screen). A Funti window that's open and in view keeps the exact count
// itself (lib/appBadge.ts); otherwise count this message on top of the last
// number it saved, in the same Cache Storage slot.
async function bumpAppBadge() {
  if (!self.navigator.setAppBadge) return;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (windows.some((c) => c.visibilityState === "visible" && c.focused)) return;
  const cache = await caches.open("funti-badge");
  const saved = await cache.match("/__funti-badge-count");
  const count = (saved ? parseInt(await saved.text(), 10) || 0 : 0) + 1;
  await cache.put("/__funti-badge-count", new Response(String(count)));
  await self.navigator.setAppBadge(count);
}

function showMessageNotification(title, url, payload) {
  return (
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/brand/funti-logo.jpg",
      badge: "/brand/funti-logo.jpg",
      // Unique per push: a shared tag (one per room/sender) made each new
      // message silently *replace* the previous one still sitting on the
      // lock screen — no banner, no sound — so a second message in the same
      // room could go completely unnoticed. Every message alerts on its own.
      tag: `${payload.tag || (payload.senderId ? `funti-dm-${payload.senderId}` : "funti-dm")}-${Date.now()}`,
      // Stays on screen until tapped/dismissed instead of disappearing on
      // its own — used for the "khách hàng nhắn tin" alert so it can't slip
      // by unnoticed the way a routine DM ping might. Android/desktop only;
      // iOS ignores this option.
      requireInteraction: Boolean(payload.requireInteraction),
      data: { senderId: payload.senderId || null, url },
    })
  );
}

// How long an open page gets to say "taken" before the link is loaded
// outright — long enough for a live tab, short enough not to feel stuck
// when the app was asleep in the background (iPad/iPhone).
const HANDOFF_MS = 900;

// The page (NotificationClickRouter) answers on the channel once it has
// taken the link; no answer in time = nobody there to take it.
function handOff(client, url) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), HANDOFF_MS);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    try {
      client.postMessage({ type: "notification-click", url }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/workspace", self.location.origin);
  const url = `${target.pathname}${target.search}${target.hash}`;

  // Prefer a window that's already open — first one inside the workspace
  // (it can switch the conversation without reloading), else any window of
  // the site — and let its router do an in-app transition. If that page
  // doesn't take the link (still waking up, or an old tab), load the link
  // in it outright; with no window at all, open one.
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const ours = all.filter((c) => new URL(c.url).origin === self.location.origin);
      const client = ours.find((c) => new URL(c.url).pathname.startsWith("/workspace")) || ours[0];
      if (!client) return self.clients.openWindow(url);
      try {
        await client.focus();
      } catch {
        // focus can be refused; the link still gets followed below
      }
      if (await handOff(client, url)) return;
      if ("navigate" in client) {
        try {
          await client.navigate(target.href);
          return;
        } catch {
          // fall through to a new window
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
