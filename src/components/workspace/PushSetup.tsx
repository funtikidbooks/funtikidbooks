"use client";

import { useEffect, useState } from "react";
import { getPushStatus, isIos, isStandalone, subscribeToPush, type PushStatus } from "@/lib/pushClient";

// Registers the service worker and keeps this device's Web Push
// subscription saved so chat notifications reach the person even when the
// tab isn't open/focused. Silent on load — it never prompts by itself (see
// subscribeToPush's `prompt` option); PushPermissionBanner below is what
// asks, from a real click.
export function PushSetup() {
  useEffect(() => {
    subscribeToPush({ prompt: false });
  }, []);

  // Notification clicks are followed by NotificationClickRouter in the root
  // layout, so they work from every page, not only the workspace.
  return null;
}

// Shown on every workspace page while this device can't receive chat
// notifications — a staff laptop with no push subscription at all got
// nothing when a message arrived while the tab sat in the background
// (sếp Phúc: sent 10:59, only noticed at 11:02 by clicking in). It can't be
// dismissed (sếp Phúc, 30/9: notifications are required, no opting out) —
// it goes away only once this device can receive them, re-checked whenever
// the app comes back to the front (e.g. after allowing it in Settings).
export function PushPermissionBanner() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Browser-only APIs — has to run post-mount, same as IosInstallHint.
    // Allowed isn't enough: the device must actually sign up with the
    // browser's push service, or nothing ever arrives — a browser that
    // blocks it used to look exactly like a working one.
    const check = async () => {
      const now = getPushStatus();
      setStatus(now);
      if (now === "granted") setStatus(await subscribeToPush({ prompt: false }));
    };
    void check();
    const onVisible = () => {
      // Allowed in Settings while away: sign this device up now.
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (status !== "default" && status !== "denied" && status !== "unsupported" && status !== "failed") return null;

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
      ) : status === "failed" ? (
        <>
          <span className="flex-1 min-w-[200px]">
            Máy này đã cho phép nhưng <b>chưa đăng ký nhận thông báo được</b> — tin nhắn sẽ không báo tới. Bấm Thử lại; vẫn lỗi thì dùng Chrome hoặc Edge (Brave, Cốc Cốc có thể chặn thông báo).
          </span>
          <button type="button" onClick={enable} disabled={busy} className="btn btn-primary btn-sm flex-none">
            {busy ? "Đang thử…" : "Thử lại"}
          </button>
        </>
      ) : status === "denied" ? (
        <span className="flex-1 min-w-[200px]">
          Thông báo đang <b>bị chặn</b> trên máy này — bắt buộc phải bật. Máy tính: bấm 🔒 (hoặc ⚙) cạnh địa chỉ web → <b>Thông báo</b> → <b>Cho phép</b>, rồi tải lại trang. iPhone/iPad: <b>Cài đặt</b> → <b>Thông báo</b> → <b>Funti</b> → bật <b>Cho phép thông báo</b>.
        </span>
      ) : (
        <span className="flex-1 min-w-[200px]">
          Trình duyệt này <b>không nhận được thông báo</b>. Hãy dùng Chrome hoặc Edge trên máy tính, hoặc app Funti trên điện thoại.
        </span>
      )}
    </div>
  );
}

// iPad/iPhone in Safari: install the workspace as an app — the one manual
// step iOS requires before push notifications can work at all. Required,
// so it can't be dismissed either.
export function IosInstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIos() || isStandalone()) return;
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
        <b>Bắt buộc bật thông báo:</b> trên iPad/iPhone bấm nút <b>Chia sẻ</b> ở Safari → <b>&quot;Thêm vào MH chính&quot;</b>, rồi mở workspace từ biểu tượng Funti đó (không mở bằng Safari) và bấm <b>Bật thông báo</b>.
      </span>
    </div>
  );
}
