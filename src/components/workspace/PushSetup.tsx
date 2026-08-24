"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/lib/actions/push";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

// Registers the service worker and subscribes this device to Web Push so
// chat notifications reach the person even when the tab isn't open/focused.
// On iPad this only works once the site has been "Added to Home Screen" —
// until then, this quietly does nothing and InstallHint (below) explains why.
export function PushSetup() {
  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (isIos() && !isStandalone()) return;

    let cancelled = false;

    async function setup() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        if (Notification.permission !== "granted") return;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey!),
          });
        }
        if (cancelled) return;

        const json = subscription.toJSON();
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
          await savePushSubscription({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          });
        }
      } catch {
        // Best-effort — chat still works via the in-page unread badge either way.
      }
    }

    setup();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

// A small dismissible banner nudging iPad/iPhone Safari users to install
// the workspace as an app — the one manual step iOS requires before push
// notifications can work at all.
export function IosInstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIos() || isStandalone()) return;
    if (sessionStorage.getItem("funti-ios-hint-dismissed")) return;
    // Deliberate: navigator/sessionStorage only exist client-side, so this
    // has to run post-mount rather than as a lazy useState initializer —
    // the standard SSR-safe pattern for browser-only conditional UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 text-[13px]"
      style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)", borderBottom: "1px solid var(--color-accent-200)" }}
    >
      <span aria-hidden>📲</span>
      <span className="flex-1">
        Để nhận thông báo tin nhắn trên iPad/iPhone: bấm nút <b>Chia sẻ</b> ở Safari → <b>&quot;Thêm vào MH chính&quot;</b>, rồi mở workspace từ biểu tượng đó thay vì Safari.
      </span>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem("funti-ios-hint-dismissed", "1");
          setVisible(false);
        }}
        className="btn-icon flex-none"
        aria-label="Đóng"
      >
        ✕
      </button>
    </div>
  );
}
