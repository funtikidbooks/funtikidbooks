"use client";

// A message that reaches an open workspace over its own live connection
// (Realtime — the same instant path the chat uses) also raises the
// system notification from here when nobody is looking at the tab: it sits
// behind another window, or the window is minimised.
//
// Without this the desktop notification only ever came through the
// browser's push service (Google's, for Chrome), and on a computer whose
// Chrome can't keep its connection to Google — antivirus, VPN, a network
// that drops long connections (Nhật Vy's, 2/10: Google accepted every test
// at once, her Chrome never got them) — messages arrived in the open tab
// without any notification at all.
//
// Same tag as the push for that message (sw.js), so when the push does
// arrive it quietly replaces this one instead of alerting twice.

export const messageNotificationTag = (messageId: string) => `funti-msg-${messageId}`;

function lookingAtTab() {
  return document.visibilityState === "visible" && document.hasFocus();
}

export async function notifyFromPage(opts: { messageId: string; title: string; body: string; url: string; senderId: string }) {
  if (typeof window === "undefined" || lookingAtTab()) return;
  if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    await reg.showNotification(opts.title, {
      body: opts.body,
      icon: "/brand/funti-logo.jpg",
      badge: "/brand/funti-logo.jpg",
      tag: messageNotificationTag(opts.messageId),
      data: { senderId: opts.senderId, url: opts.url },
    });
  } catch {
    // The push (if it gets through) still shows it.
  }
}

// A message taken back before it was saved (lib/chatSyncCursor.ts).
export async function closeMessageNotification(messageId: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const shown = (await reg?.getNotifications({ tag: messageNotificationTag(messageId) })) ?? [];
    shown.forEach((n) => n.close());
  } catch {
    // nothing to close
  }
}
