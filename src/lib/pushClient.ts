"use client";

import { savePushSubscription } from "@/lib/actions/push";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export type PushStatus = "unsupported" | "needs-ios-install" | "denied" | "granted" | "default";

// Reads current state without prompting or subscribing — used to render
// the right message/button in the profile dialog.
export function getPushStatus(): PushStatus {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (isIos() && !isStandalone()) return "needs-ios-install";
  return Notification.permission as PushStatus; // "default" | "denied" | "granted"
}

// Registers the service worker, prompts for permission if needed, and
// saves the subscription. Shared by the silent auto-run on every workspace
// page load (PushSetup) and the manual "Bật thông báo" button in the
// profile dialog for anyone who dismissed/missed that first prompt.
export async function subscribeToPush(): Promise<PushStatus> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return "unsupported";

  const status = getPushStatus();
  if (status === "unsupported" || status === "needs-ios-install") return status;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") return Notification.permission as PushStatus;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = subscription.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await savePushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
    }
    return "granted";
  } catch {
    return "denied";
  }
}
