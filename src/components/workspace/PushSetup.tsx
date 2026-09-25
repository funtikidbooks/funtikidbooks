"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPushStatus, isIos, isStandalone, subscribeToPush, type PushStatus } from "@/lib/pushClient";

// Registers the service worker and keeps this device's Web Push
// subscription saved so chat notifications reach the person even when the
// tab isn't open/focused. Silent on load — it never prompts by itself (see
// subscribeToPush's `prompt` option); PushPermissionBanner below is what
// asks, from a real click.
export function PushSetup() {
  const router = useRouter();

  useEffect(() => {
    subscribeToPush({ prompt: false });
  }, []);

  // sw.js focuses the existing tab on a notification click instead of doing
  // a hard client.navigate() (which reloaded the whole app every time) —
  // this is the other half: it posts the target URL here so we can hand it
  // to Next's own router for a normal client-side transition instead.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function onMessage(event: MessageEvent) {
      if (event.data?.type === "notification-click" && typeof event.data.url === "string") {
        router.push(event.data.url);
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}

// Shown on every workspace page while this device can't receive chat
// notifications — a staff laptop with no push subscription at all got
// nothing when a message arrived while the tab sat in the background
// (sếp Phúc: sent 10:59, only noticed at 11:02 by clicking in). Dismissing
// only hides it for this browser session, since missing messages is costly.
export function PushPermissionBanner() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("funti-push-banner-dismissed")) return;
    // Browser-only APIs — has to run post-mount, same as IosInstallHint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(getPushStatus());
  }, []);

  if (status !== "default" && status !== "denied") return null;

  async function enable() {
    setBusy(true);
    setStatus(await subscribeToPush());
    setBusy(false);
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 text-[13px] flex-wrap"
      style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)", borderBottom: "1px solid var(--color-accent-200)" }}
    >
      <span aria-hidden>🔔</span>
      {status === "default" ? (
        <>
          <span className="flex-1 min-w-[200px]">
            Máy này <b>chưa bật thông báo tin nhắn</b> — có tin mới khi đang ở tab khác sẽ không được báo.
          </span>
          <button type="button" onClick={enable} disabled={busy} className="btn btn-primary btn-sm flex-none">
            {busy ? "Đang bật…" : "Bật thông báo"}
          </button>
        </>
      ) : (
        <span className="flex-1 min-w-[200px]">
          Thông báo đang <b>bị chặn</b> trên trình duyệt này. Bấm biểu tượng 🔒 (hoặc ⚙) cạnh địa chỉ web → <b>Thông báo</b> → <b>Cho phép</b>, rồi tải lại trang.
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem("funti-push-banner-dismissed", "1");
          setStatus(null);
        }}
        className="btn-icon flex-none"
        aria-label="Đóng"
      >
        ✕
      </button>
    </div>
  );
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
