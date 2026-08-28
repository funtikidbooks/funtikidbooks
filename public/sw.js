// Minimal service worker whose only job is Web Push delivery for the
// workspace chat — no offline caching, so it can't make the site feel stale.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/brand/funti-logo.jpg",
      badge: "/brand/funti-logo.jpg",
      tag: payload.tag || (payload.senderId ? `funti-dm-${payload.senderId}` : "funti-dm"),
      data: { senderId: payload.senderId || null, url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/workspace";

  // Prefer focusing the tab that's already open and letting its own router
  // do a client-side transition — client.navigate() did a full hard reload
  // of the whole app on every single notification click, even when the
  // right tab was already sitting right there.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          client.postMessage({ type: "notification-click", url });
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
