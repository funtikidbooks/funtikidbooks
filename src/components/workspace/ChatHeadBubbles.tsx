"use client";

import { useMemo } from "react";
import { useChatManager } from "@/components/workspace/ChatManager";
import { thumbnailUrl } from "@/lib/imageTransform";
import type { Profile } from "@/lib/types";

const MAX_BUBBLES = 5;

// Facebook Messenger's floating "chat head" bubbles — when a DM arrives
// (and its window isn't already open), a round avatar with a red unread
// badge appears floating near the bottom of the screen; tapping it opens
// the same floating ChatWindow the Messenger dropdown uses, for a
// one-tap reply without hunting through the dropdown first.
export function ChatHeadBubbles({ profiles }: { profiles: Profile[] }) {
  const { unreadCounts, recentSenderOrder, openChat, openChats } = useChatManager();
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const bubbles = useMemo(() => {
    const openIds = new Set(openChats.map((p) => p.id));
    return Object.keys(unreadCounts)
      .filter((id) => unreadCounts[id] > 0 && !openIds.has(id))
      .sort((a, b) => {
        const ai = recentSenderOrder.indexOf(a);
        const bi = recentSenderOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return 0;
      })
      .map((id) => profileById.get(id))
      .filter((p): p is Profile => !!p)
      .slice(0, MAX_BUBBLES);
  }, [unreadCounts, recentSenderOrder, openChats, profileById]);

  if (bubbles.length === 0) return null;

  return (
    <div className="fixed z-40 flex flex-col-reverse items-end gap-2 bottom-[76px] right-4 md:bottom-4">
      {bubbles.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => openChat(p)}
          className="relative elev-lg rounded-full flex-none"
          style={{ width: 52, height: 52 }}
          aria-label={`Trả lời ${p.display_name}`}
          title={p.display_name}
        >
          <span
            className="flex items-center justify-center rounded-full font-bold overflow-hidden w-full h-full"
            style={{
              background: "var(--color-accent-2-100)",
              color: "var(--color-accent-2-800)",
              fontSize: 16,
              border: "2px solid var(--color-panel)",
            }}
          >
            {p.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl(p.avatar_url, 104)} alt="" className="w-full h-full object-cover" />
            ) : (
              p.display_name.charAt(0).toUpperCase()
            )}
          </span>
          <span
            className="absolute flex items-center justify-center rounded-full font-bold"
            style={{
              top: -2,
              right: -2,
              minWidth: 20,
              height: 20,
              padding: "0 4px",
              fontSize: 11,
              background: "var(--status-red)",
              color: "#fff",
              border: "2px solid var(--color-panel)",
            }}
          >
            {unreadCounts[p.id] > 9 ? "9+" : unreadCounts[p.id]}
          </span>
        </button>
      ))}
    </div>
  );
}
