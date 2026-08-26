"use client";

import { useMemo, useState } from "react";
import { useChatManager } from "@/components/workspace/ChatManager";
import { DirectConversation } from "@/components/workspace/DirectConversation";
import { usePresence } from "@/lib/usePresence";
import type { Profile } from "@/lib/types";

// The "Riêng" tab inside Trò chuyện & họp — 1:1 chat rendered inline (full
// panel) instead of the small floating ChatWindow, with a rail of teammate
// avatars on the left to pick who to talk to. Reuses the same
// DirectConversation body as the floating chat, so they stay in sync
// feature-for-feature.
export function DirectMessagesPanel({
  currentUser,
  profiles,
}: {
  currentUser: Pick<Profile, "id" | "display_name">;
  profiles: Profile[];
}) {
  const { unreadCounts, recentSenderOrder, clearDmUnread } = useChatManager();
  const onlineIds = usePresence(currentUser.id);
  const [selectedPeer, setSelectedPeer] = useState<Profile | null>(null);

  const teammates = useMemo(() => {
    return profiles
      .filter((p) => p.id !== currentUser.id)
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
  }, [profiles, currentUser.id, recentSenderOrder, unreadCounts, onlineIds]);

  return (
    <div className="flex flex-1 min-h-0">
      <div
        className="w-[220px] flex-none flex flex-col gap-0.5 overflow-y-auto py-2 px-1.5"
        style={{ borderRight: "1px solid var(--color-neutral-200)" }}
      >
        {teammates.length === 0 ? (
          <p className="text-[12px] text-center py-4 px-2" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có thành viên nào khác.
          </p>
        ) : (
          teammates.map((p) => {
            const online = onlineIds.has(p.id);
            const unread = unreadCounts[p.id] ?? 0;
            const active = selectedPeer?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedPeer(p);
                  clearDmUnread(p.id);
                }}
                className="ws-nav-link flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] text-left"
                style={{
                  background: active ? "var(--color-accent-100)" : undefined,
                }}
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
                  <span className="block text-[13px] truncate" style={{ fontWeight: unread > 0 ? 700 : 600, color: active ? "var(--color-accent-700)" : undefined }}>
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

      <div className="flex-1 flex flex-col min-w-0">
        {!selectedPeer ? (
          <div className="flex-1 flex items-center justify-center text-sm text-center px-4" style={{ color: "var(--color-neutral-500)" }}>
            Chọn một thành viên bên trái để bắt đầu trò chuyện riêng.
          </div>
        ) : (
          <>
            <div className="flex-none flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
              <span
                className="flex items-center justify-center rounded-full text-[11px] font-bold overflow-hidden flex-none"
                style={{ width: 28, height: 28, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
              >
                {selectedPeer.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedPeer.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  selectedPeer.display_name.charAt(0).toUpperCase()
                )}
              </span>
              <span className="font-bold flex-1 truncate">{selectedPeer.display_name}</span>
            </div>
            <DirectConversation peer={selectedPeer} currentUser={currentUser} />
          </>
        )}
      </div>
    </div>
  );
}
