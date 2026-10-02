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

import { inboxTopic, sendChatBroadcast } from "@/lib/chatBroadcast";
import { deviceLabel } from "@/lib/pushClient";

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

// "Đo tín hiệu" (Quản trị → Thông báo trên máy) also checks this path: the
// board sends "notify-test" to the person's inbox topic; each of their open
// workspaces raises the test notification right away (same tag as the test
// push, so a device that gets both shows one) and answers on the board's
// inbox topic — whether it could, and whether anyone was looking.
export type NotifyTest = { probeId: string; from: string };
export type NotifyTestAck = { probeId: string; userId: string; device: string; shown: boolean; reason: string | null; looking: boolean };

export async function answerNotifyTest(test: NotifyTest, meId: string) {
  if (!test?.probeId || !test.from) return;
  const looking = lookingAtTab();
  let shown = false;
  let reason: string | null = null;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) reason = "unsupported";
  else if (Notification.permission !== "granted") reason = Notification.permission; // "default" | "denied"
  else {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reason = "no-sw";
      else {
        await reg.showNotification("Funti Kidbooks Studio · kiểm tra", {
          body: "Thông báo thử từ quản lý — thấy tin này là máy bạn đang nhận thông báo tốt.",
          icon: "/brand/funti-logo.jpg",
          badge: "/brand/funti-logo.jpg",
          tag: messageNotificationTag(test.probeId),
          data: { url: "/workspace" },
        });
        shown = true;
      }
    } catch {
      reason = "error";
    }
  }
  const ack: NotifyTestAck = { probeId: test.probeId, userId: meId, device: deviceLabel(), shown, reason, looking };
  sendChatBroadcast(inboxTopic(test.from), "notify-test-ack", ack);
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
