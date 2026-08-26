"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChatManager } from "@/components/workspace/ChatManager";
import { usePresence } from "@/lib/usePresence";
import type { Profile } from "@/lib/types";

// A Messenger-style icon + dropdown for 1:1 chat, split out of the sidebar's
// old always-visible "Thành viên Funti" list so it doesn't eat vertical
// space on every workspace page — now it's one click away from the topbar,
// same as Facebook's Messenger popover: a red badge when something's
// unread, newest conversation pinned to the top.
export function MessengerButton({ currentUserId, profiles }: { currentUserId: string; profiles: Profile[] }) {
  const { openChat, unreadCounts, recentSenderOrder } = useChatManager();
  const onlineIds = usePresence(currentUserId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const totalUnread = useMemo(() => Object.values(unreadCounts).reduce((sum, n) => sum + n, 0), [unreadCounts]);

  const teammates = useMemo(() => {
    return profiles
      .filter((p) => p.id !== currentUserId)
      .sort((a, b) => {
        const aRecent = recentSenderOrder.indexOf(a.id);
        const bRecent = recentSenderOrder.indexOf(b.id);
        if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;
        if (aRecent !== -1) return -1;
        if (bRecent !== -1) return 1;

        const aUnread = unreadCounts[a.id] ?? 0;
        const bUnread = unreadCounts[b.id] ?? 0;
        if (aUnread > 0 && bUnread === 0) return -1;
        if (aUnread === 0 && bUnread > 0) return 1;

        const aOnline = onlineIds.has(a.id) ? 0 : 1;
        const bOnline = onlineIds.has(b.id) ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return a.display_name.localeCompare(b.display_name);
      });
  }, [profiles, currentUserId, recentSenderOrder, unreadCounts, onlineIds]);

  return (
    <div ref={rootRef} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-icon relative flex-none"
        style={{ width: 30, height: 30, padding: 0 }}
        aria-label="Tin nhắn"
        title="Tin nhắn"
      >
        💬
        {totalUnread > 0 && (
          <span
            className="absolute flex items-center justify-center rounded-full font-bold"
            style={{
              top: -2,
              right: -2,
              minWidth: 15,
              height: 15,
              padding: "0 3px",
              fontSize: 9,
              background: "var(--status-red)",
              color: "#fff",
              border: "1.5px solid var(--color-bg)",
            }}
          >
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="card elev-lg flex flex-col"
          style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 300, maxHeight: 420, zIndex: 50 }}
        >
          <div className="px-3.5 py-3 font-bold text-sm" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
            Tin nhắn
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {teammates.length === 0 ? (
              <p className="text-[12px] text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                Chưa có thành viên nào khác.
              </p>
            ) : (
              teammates.map((p) => {
                const online = onlineIds.has(p.id);
                const unread = unreadCounts[p.id] ?? 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      openChat(p);
                      setOpen(false);
                    }}
                    className="ws-nav-link flex items-center gap-2.5 px-3.5 py-2 text-left w-full"
                  >
                    <span className="relative flex-none">
                      <span
                        className="flex items-center justify-center rounded-full text-[12px] font-bold overflow-hidden"
                        style={{ width: 32, height: 32, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                      >
                        {p.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          p.display_name.charAt(0).toUpperCase()
                        )}
                      </span>
                      <span
                        className="absolute rounded-full"
                        style={{
                          width: 9,
                          height: 9,
                          right: -1,
                          bottom: -1,
                          background: online ? "var(--status-green)" : "var(--color-neutral-400)",
                          border: "2px solid var(--color-panel)",
                        }}
                      />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className="block text-[13px] truncate"
                        style={{ fontWeight: unread > 0 ? 700 : 600 }}
                      >
                        {p.display_name}
                      </span>
                      <span className="block text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                        {p.role ?? (online ? "Đang hoạt động" : "")}
                      </span>
                    </span>
                    {unread > 0 && (
                      <span
                        className="flex items-center justify-center rounded-full font-bold flex-none"
                        style={{ minWidth: 18, height: 18, padding: "0 5px", fontSize: 10, background: "var(--status-red)", color: "#fff" }}
                      >
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
