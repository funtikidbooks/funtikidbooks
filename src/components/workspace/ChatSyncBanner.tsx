"use client";

import { useRouter } from "next/navigation";
import { useChatSyncProblem } from "@/lib/chatSyncHealth";

export function ChatSyncBanner() {
  const problem = useChatSyncProblem();
  const router = useRouter();
  if (!problem) return null;

  const isSession = problem === "session";
  return (
    <div
      role="alert"
      className="no-print flex-none flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px] font-semibold"
      style={{ background: "var(--status-red)", color: "#fff" }}
    >
      <span>
        {isSession
          ? "Phiên đăng nhập đã hết hạn — tin nhắn mới không tải được."
          : "Mất kết nối — tin nhắn mới có thể chưa hiện. Đang thử lại…"}
      </span>
      <button
        type="button"
        className="rounded-full px-3 py-1 text-[12px] font-bold flex-none"
        style={{ background: "#fff", color: "var(--status-red)" }}
        onClick={() => {
          if (isSession) {
            router.push(`/dang-nhap?next=${encodeURIComponent(window.location.pathname)}`);
          } else {
            window.location.reload();
          }
        }}
      >
        {isSession ? "Đăng nhập lại" : "Tải lại trang"}
      </button>
    </div>
  );
}
