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

// A subscription's key can be missing (older browsers don't expose it) —
// then trust it rather than churn subscriptions on every open.
function sameKey(existing: ArrayBuffer | null, current: Uint8Array) {
  if (!existing) return true;
  const a = new Uint8Array(existing);
  return a.length === current.length && a.every((b, i) => b === current[i]);
}

// What the device is, for Quản trị → Thông báo trên máy: "iPhone · app",
// "Android · Chrome", "Windows · Edge"…
export function deviceLabel() {
  const ua = navigator.userAgent;
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const os = /iPhone/.test(ua) ? "iPhone" : iPad ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Máy khác";
  const app = isStandalone()
    ? "app"
    : /Edg\//.test(ua)
      ? "Edge"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "trình duyệt";
  return `${os} · ${app}`;
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
//
// `prompt: false` only (re)saves an existing permission — the silent page-load
// path uses it, because Chrome quietly suppresses permission prompts that
// don't come from a click (and can auto-block the site after a few), which
// is how some staff machines ended up never subscribed at all. The real
// prompt only happens from a button (PushPermissionBanner / ProfileMenu).
export async function subscribeToPush({ prompt = true }: { prompt?: boolean } = {}): Promise<PushStatus> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return "unsupported";

  const status = getPushStatus();
  if (status === "unsupported" || status === "needs-ios-install") return status;
  if (!prompt && status !== "granted") return status;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") return Notification.permission as PushStatus;

    const serverKey = urlBase64ToUint8Array(publicKey);
    let subscription = await registration.pushManager.getSubscription();
    // Made with a different server key (an old one): every push to it is
    // refused, and it would never be replaced on its own — start fresh.
    if (subscription && !sameKey(subscription.options?.applicationServerKey ?? null, serverKey)) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
    }

    const json = subscription.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await savePushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }, deviceLabel());
    }
    return "granted";
  } catch {
    return "denied";
  }
}
