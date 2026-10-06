"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "@/lib/actions/auth";
import { reportPushState } from "@/lib/actions/push";
import { resetThemeOnSignOut } from "@/lib/useTheme";
import { deviceLabel, getPushStatus, isIos, subscribeToPush, type PushStatus } from "@/lib/pushClient";

// Registers the service worker and keeps this device's Web Push
// subscription saved so chat notifications reach the person even when the
// tab isn't open/focused. Silent on load — it never prompts by itself (see
// subscribeToPush's `prompt` option); PushGate below is what asks, from a
// real click.
export function PushSetup() {
  useEffect(() => {
    subscribeToPush({ prompt: false });
  }, []);

  // Notification clicks are followed by NotificationClickRouter in the root
  // layout, so they work from every page, not only the workspace.
  return null;
}

type Os = "iphone" | "ipad" | "android" | "mac" | "computer";
function osOf(): Os {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ipad";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua)) return "mac";
  return "computer";
}
// Zalo / Facebook / Messenger / Instagram open links in their own browser,
// which can't get notifications at all.
const inAppBrowser = () => /Zalo|FBAN|FBAV|FB_IAB|Instagram|Line\//i.test(navigator.userAgent);

const BLOCKING: PushStatus[] = ["default", "denied", "failed", "needs-ios-install", "unsupported"];

// Notifications are required (sếp Phúc, 30/9 and 5/10): a device that can't
// get them shows this over the whole workspace, with the steps for exactly
// that device, until it can. The old orange bar was easy to ignore — Ánh
// Dương, Như Ý and Lucia worked for days on devices that never got a single
// notification. Every check is also reported (push_device_state.sql), so
// Quản trị → Thông báo trên máy sees which device each person is really on.
export function PushGate() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  // Every check is reported, not just changes — a device stuck on this
  // screen keeps showing up in Quản trị with when it last tried.
  const settle = useCallback((next: PushStatus) => {
    setStatus(next);
    reportPushState(deviceLabel(), next, navigator.userAgent).catch(() => {});
  }, []);

  useEffect(() => {
    // Browser-only APIs — has to run post-mount. Allowed isn't enough: the
    // device must actually sign up with the browser's push service, or
    // nothing ever arrives. A failed sign-up is tried once more before the
    // screen goes up — a phone just waking often has no network for a moment.
    let cancelled = false;
    const check = async () => {
      let now = getPushStatus();
      if (now === "granted") now = await subscribeToPush({ prompt: false });
      if (now === "failed") {
        await new Promise((r) => setTimeout(r, 3000));
        if (cancelled) return;
        now = await subscribeToPush({ prompt: false });
      }
      if (!cancelled) settle(now);
    };
    void check();
    const onVisible = () => {
      // Allowed in Settings while away: sign this device up now.
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [settle]);

  if (!status || !BLOCKING.includes(status)) return null;

  async function enable() {
    setBusy(true);
    settle(await subscribeToPush());
    setBusy(false);
  }

  const os = osOf();
  const steps = stepsFor(status, os);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-gate-title"
      className="fixed inset-0 z-[300] overflow-y-auto flex items-start sm:items-center justify-center p-4"
      style={{ background: "var(--color-bg)", paddingTop: "max(16px, env(safe-area-inset-top))", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <div className="card elev-lg w-full flex flex-col gap-5 p-5 sm:p-7" style={{ maxWidth: 560 }}>
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="text-4xl leading-none">
            🔔
          </span>
          <h1 id="push-gate-title" className="text-xl sm:text-2xl">
            {steps.title}
          </h1>
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-neutral-600)" }}>
            Thông báo tin nhắn là bắt buộc ở Funti. Làm theo các bước dưới đây — xong là vào workspace ngay.
          </p>
        </div>

        {steps.list.length > 0 && (
          <ol className="flex flex-col gap-3">
            {steps.list.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="flex-none flex items-center justify-center rounded-full text-[13px] font-bold"
                  style={{ width: 26, height: 26, background: "var(--color-accent-500)", color: "#fff" }}
                >
                  {i + 1}
                </span>
                <span className="text-[15px] leading-snug pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        )}

        {steps.note && (
          <p className="text-[13px] leading-relaxed rounded-[10px] px-3.5 py-2.5" style={{ background: "var(--color-surface)", color: "var(--color-neutral-700)" }}>
            {steps.note}
          </p>
        )}

        {steps.action === "enable" && (
          <button type="button" onClick={enable} disabled={busy} className="btn btn-primary w-full" style={{ minHeight: 48, fontSize: 16 }}>
            {busy ? "Đang bật…" : status === "failed" ? "Thử lại" : "🔔 Bật thông báo"}
          </button>
        )}
        {steps.action === "reload" && (
          <button type="button" onClick={() => window.location.reload()} className="btn btn-primary w-full" style={{ minHeight: 48, fontSize: 16 }}>
            Tôi đã bật — kiểm tra lại
          </button>
        )}

        <p className="text-[11px] text-center" style={{ color: "var(--color-neutral-400)" }}>
          {deviceLabel()} · {status}
        </p>

        <form action={signOut} onSubmit={resetThemeOnSignOut} className="flex justify-center">
          <button type="submit" className="text-[12.5px] font-semibold hover:underline" style={{ color: "var(--color-neutral-500)" }}>
            Đăng xuất
          </button>
        </form>
      </div>
    </div>
  );
}

type Steps = { title: string; list: React.ReactNode[]; note?: React.ReactNode; action: "enable" | "reload" | "none" };

function stepsFor(status: PushStatus, os: Os): Steps {
  const b = (t: string) => <b>{t}</b>;

  if (inAppBrowser()) {
    return {
      title: "Mở workspace bằng trình duyệt thật",
      list: [
        <>Trang này đang mở bên trong Zalo/Facebook — ở đây không nhận được thông báo.</>,
        <>Bấm {b("⋯")} (góc trên) → {b(os === "iphone" || os === "ipad" ? "Mở bằng Safari" : "Mở bằng trình duyệt")}.</>,
        os === "iphone" || os === "ipad" ? <>Rồi làm theo hướng dẫn hiện ra trong Safari.</> : <>Đăng nhập lại nếu được hỏi.</>,
      ],
      action: "none",
    };
  }

  if (status === "needs-ios-install") {
    const shareWhere = os === "ipad" ? "góc trên bên phải" : "thanh dưới cùng";
    return {
      title: os === "ipad" ? "Cài app Funti lên iPad" : "Cài app Funti lên iPhone",
      list: [
        <>Bấm nút {b("Chia sẻ")} (ô vuông có mũi tên lên ⬆️) ở {shareWhere} của Safari.</>,
        <>Kéo xuống, chọn {b("Thêm vào MH chính")} → bấm {b("Thêm")}.</>,
        <>Đóng Safari. Mở {b("Funti")} từ biểu tượng mới trên màn hình chính.</>,
        <>Trong app, bấm {b("Bật thông báo")} → {b("Cho phép")}.</>,
      ],
      note: <>iPhone/iPad chỉ nhận thông báo khi mở bằng app Funti trên màn hình chính, không nhận khi mở bằng Safari.</>,
      action: "none",
    };
  }

  if (status === "default") {
    return {
      title: "Bật thông báo tin nhắn",
      list: [<>Bấm nút {b("Bật thông báo")} bên dưới.</>, <>Khi máy hỏi, chọn {b("Cho phép")}.</>],
      action: "enable",
    };
  }

  if (status === "denied") {
    const list =
      os === "iphone" || os === "ipad"
        ? [
            <>Mở {b("Cài đặt")} của máy → {b("Thông báo")} → {b("Funti")} → bật {b("Cho phép thông báo")}. (Máy mới: {b("Cài đặt")} → {b("Ứng dụng")} → {b("Funti")} → {b("Thông báo")}.)</>,
            <>Vuốt tắt hẳn app Funti (vuốt lên từ đáy màn hình, đẩy Funti lên), rồi mở lại từ biểu tượng.</>,
            <>Vẫn thấy màn hình này thì bấm nút bên dưới.</>,
          ]
        : os === "android"
          ? [
              <>Bấm {b("⋮")} góc trên Chrome → {b("Cài đặt")} → {b("Cài đặt trang web")} → {b("Thông báo")}.</>,
              <>Chọn {b("funtikidbooks.com")} → {b("Cho phép")}.</>,
              <>Quay lại đây và bấm nút bên dưới.</>,
            ]
          : os === "mac"
            ? [
                <>Trên thanh menu: {b("Safari")} (hoặc Chrome) → {b("Cài đặt")} → {b("Trang web")} → {b("Thông báo")}.</>,
                <>Chọn {b("funtikidbooks.com")} → {b("Cho phép")}.</>,
                <>Bấm nút bên dưới.</>,
              ]
            : [
                <>Bấm biểu tượng {b("🔒")} (hoặc {b("⚙")}) ngay bên trái địa chỉ web, trên cùng.</>,
                <>Ở dòng {b("Thông báo")}, chọn {b("Cho phép")}.</>,
                <>Bấm nút bên dưới để tải lại trang.</>,
              ];
    return {
      title: "Thông báo đang bị chặn trên máy này",
      list,
      // iPhone/iPad keep reading "blocked" until the app restarts — and when
      // Funti isn't listed in Settings at all, only a fresh install resets it
      // (Như Ý's iPad, 6/10).
      note:
        os === "iphone" || os === "ipad" ? (
          <>
            Không thấy Funti trong Cài đặt, hoặc đã bật mà vẫn bị chặn: chạm giữ biểu tượng {b("Funti")} → {b("Xoá ứng dụng")}. Mở funtikidbooks.com bằng {b("Safari")} → {b("Chia sẻ")} → {b("Thêm vào MH chính")}, mở app mới, đăng nhập rồi bấm {b("Bật thông báo")} → {b("Cho phép")}.
          </>
        ) : undefined,
      action: "reload",
    };
  }

  if (status === "failed") {
    return {
      title: "Máy chưa đăng ký nhận thông báo được",
      list: [<>Kiểm tra máy đang có mạng (Wi-Fi hoặc 4G).</>, <>Bấm {b("Thử lại")}.</>],
      note: isIos()
        ? <>Vẫn không được: xoá app Funti khỏi màn hình chính, mở lại funtikidbooks.com bằng Safari và cài lại app.</>
        : <>Vẫn không được: dùng {b("Chrome")} hoặc {b("Edge")} — Brave, Cốc Cốc và chế độ ẩn danh thường chặn thông báo.</>,
      action: "enable",
    };
  }

  // unsupported
  return {
    title: "Trình duyệt này không nhận được thông báo",
    list:
      os === "iphone" || os === "ipad"
        ? [<>Cập nhật iOS/iPadOS lên bản mới (Cài đặt → Cài đặt chung → Cập nhật phần mềm).</>, <>Mở funtikidbooks.com bằng {b("Safari")} rồi cài app Funti ra màn hình chính.</>]
        : os === "android"
          ? [<>Mở funtikidbooks.com/workspace bằng {b("Chrome")}.</>]
          : [<>Mở funtikidbooks.com/workspace bằng {b("Chrome")} hoặc {b("Edge")}.</>, <>Không dùng chế độ ẩn danh.</>],
    action: "none",
  };
}
