"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { thumbnailUrl } from "@/lib/imageTransform";
import { useChatManager, useLiveProfiles, type ChatToast } from "@/components/workspace/ChatManager";
import type { Profile } from "@/lib/types";

const VISIBLE_MS = 7000;

// Room name/icon lookups, shared across every popup this session — a busy
// room would otherwise refetch its own name for each message.
const roomCache = new Map<string, { name: string; icon: string }>();

// Zalo/Messenger-desktop-style popup in the top-right corner for each
// message that dings — shows which room (or DM) it came from, who sent it
// and a preview, on every workspace page. Clicking jumps straight to that
// conversation. Top-right on purpose: the bottom-right corner already holds
// the floating chat windows and chat-head bubbles.
export function MessageToasts({ profiles: profilesProp }: { profiles: Profile[] }) {
  const { toasts, dismissToast } = useChatManager();
  const profiles = useLiveProfiles(profilesProp);
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-50 flex flex-col gap-2 pointer-events-none left-3 right-3 md:left-auto md:right-4 md:w-[340px]"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 56px)" }}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.key} toast={t} sender={profiles.find((p) => p.id === t.senderId) ?? null} onDismiss={() => dismissToast(t.key)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, sender, onDismiss }: { toast: ChatToast; sender: Profile | null; onDismiss: () => void }) {
  const router = useRouter();
  const [room, setRoom] = useState(() => (toast.channelId ? roomCache.get(toast.channelId) ?? null : null));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const channelId = toast.channelId;
    if (toast.kind !== "room" || !channelId || roomCache.has(channelId)) return;
    let cancelled = false;
    createClient()
      .from("meeting_channels")
      .select("name, icon")
      .eq("id", channelId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        roomCache.set(channelId, data);
        if (!cancelled) setRoom(data);
      });
    return () => {
      cancelled = true;
    };
  }, [toast.kind, toast.channelId]);

  // Auto-dismiss, paused while the pointer is over it so it doesn't vanish
  // mid-read.
  function startTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onDismiss, VISIBLE_MS);
  }
  function stopTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  useEffect(() => {
    startTimer();
    return stopTimer;
    // Once per popup — onDismiss is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open() {
    const url = toast.kind === "room" ? `/workspace/hop?room=${toast.channelId}` : `/workspace/hop?dm=${toast.senderId}`;
    // Already on the chat page: the query-string change alone doesn't
    // remount MeetingHub, so it listens for this to switch conversations
    // (same path a push-notification click takes).
    window.dispatchEvent(new CustomEvent("funti-open-chat", { detail: { url } }));
    router.push(url);
    onDismiss();
  }

  const senderName = sender?.display_name ?? "Ai đó";
  const preview = toast.content.trim() || (toast.hasAttachment ? "📎 Đã gửi một tệp đính kèm" : "");
  const where = toast.kind === "room" ? `${room?.icon ?? "💬"} ${room?.name ?? "Phòng họp"}` : "💬 Tin nhắn riêng";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") open();
      }}
      onMouseEnter={stopTimer}
      onMouseLeave={startTimer}
      className="fk-toast-in pointer-events-auto card elev-lg flex flex-col gap-1.5 p-3 cursor-pointer text-left"
      style={{ borderLeft: "4px solid var(--color-accent-500)" }}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-[11px] font-bold" style={{ color: "var(--color-accent-700)" }}>
          {where}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="btn-icon flex-none"
          style={{ width: 22, height: 22, padding: 0, fontSize: 11, color: "var(--color-neutral-500)" }}
          aria-label="Đóng"
        >
          ✕
        </button>
      </div>
      <div className="flex items-start gap-2.5">
        {sender?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl(sender.avatar_url, 64)}
            alt=""
            className="rounded-full flex-none object-cover"
            style={{ width: 32, height: 32 }}
          />
        ) : (
          <span
            className="flex items-center justify-center rounded-full flex-none font-bold text-[13px]"
            style={{ width: 32, height: 32, background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
          >
            {senderName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-bold truncate">{senderName}</span>
          <span
            className="text-[13px] leading-snug"
            style={{
              color: "var(--color-neutral-700)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-word",
            }}
          >
            {preview}
          </span>
        </div>
      </div>
    </div>
  );
}
