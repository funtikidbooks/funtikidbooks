"use client";

import { useEffect, useState } from "react";
import { isIos, isStandalone, subscribeToPush } from "@/lib/pushClient";

// Registers the service worker and subscribes this device to Web Push so
// chat notifications reach the person even when the tab isn't open/focused.
// On iPad this only works once the site has been "Added to Home Screen" —
// until then, this quietly does nothing and InstallHint (below) explains why.
// Runs silently on every workspace load; anyone who dismissed the native
// permission prompt (now stuck on "denied") can retry manually from the
// "Bật thông báo" button in their profile (ProfileMenu.tsx).
export function PushSetup() {
  useEffect(() => {
    subscribeToPush();
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
