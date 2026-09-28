"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useChatSyncProblem } from "@/lib/chatSyncHealth";
import { useConnectivity } from "@/lib/connectivity";

// The one place staff see whether chat can get through right now:
//   red    — no network; what they send is queued and goes out on its own
//   yellow — network is back but chat is still reconnecting
//   green  — briefly, once it's back, with how many queued messages went out
// plus the older sync problems (session expired, repeated fetch failures).
const RESTORED_VISIBLE_MS = 4000;

function Bar({
  tone,
  children,
  action,
}: {
  tone: "red" | "yellow" | "green";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const bg = tone === "red" ? "var(--status-red)" : tone === "yellow" ? "var(--status-yellow)" : "var(--status-green)";
  return (
    <div
      role={tone === "green" ? "status" : "alert"}
      aria-live="polite"
      className="no-print flex-none flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px] font-semibold"
      style={{ background: bg, color: "#fff" }}
    >
      <span>{children}</span>
      {action}
    </div>
  );
}

export function ChatSyncBanner() {
  const problem = useChatSyncProblem();
  const net = useConnectivity();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  // Re-render once the green "back online" moment is over so it goes away.
  useEffect(() => {
    if (!net.restoredAt) return;
    const left = net.restoredAt + RESTORED_VISIBLE_MS - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), left + 50);
    return () => clearTimeout(t);
  }, [net.restoredAt]);

  const waiting = net.pending > 0 ? ` · ${net.pending} tin đang chờ gửi` : "";

  if (net.state === "offline") {
    return <Bar tone="red">⚠ Mất kết nối mạng — tin nhắn sẽ tự gửi ngay khi có mạng lại{waiting}</Bar>;
  }
  if (net.state === "reconnecting") {
    return <Bar tone="yellow">Đang kết nối lại…{waiting}</Bar>;
  }
  if (problem === "session") {
    return (
      <Bar
        tone="red"
        action={
          <button
            type="button"
            className="rounded-full px-3 py-1 text-[12px] font-bold flex-none"
            style={{ background: "#fff", color: "var(--status-red)" }}
            onClick={() => router.push(`/dang-nhap?next=${encodeURIComponent(window.location.pathname)}`)}
          >
            Đăng nhập lại
          </button>
        }
      >
        Phiên đăng nhập đã hết hạn — tin nhắn mới không tải được.
      </Bar>
    );
  }
  // `now` only moves when the timer above fires, so a fresh restore
  // (restoredAt newer than now) always shows, and hides after the delay.
  if (net.restoredAt && now - net.restoredAt < RESTORED_VISIBLE_MS) {
    const sent = Math.max(0, net.pendingAtRestore - net.pending);
    return (
      <Bar tone="green">
        ✓ Đã có mạng lại
        {net.pending > 0 ? ` — đang gửi ${net.pending} tin…` : sent > 0 ? ` — đã gửi ${sent} tin đang chờ` : ""}
      </Bar>
    );
  }
  if (problem === "offline") {
    return (
      <Bar
        tone="red"
        action={
          <button
            type="button"
            className="rounded-full px-3 py-1 text-[12px] font-bold flex-none"
            style={{ background: "#fff", color: "var(--status-red)" }}
            onClick={() => window.location.reload()}
          >
            Tải lại trang
          </button>
        }
      >
        Không tải được tin nhắn mới — đang thử lại…
      </Bar>
    );
  }
  return null;
}
