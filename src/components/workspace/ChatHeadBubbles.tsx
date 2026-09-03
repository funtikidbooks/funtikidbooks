"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChatManager } from "@/components/workspace/ChatManager";
import { thumbnailUrl } from "@/lib/imageTransform";
import type { Profile } from "@/lib/types";

const MAX_BUBBLES = 5;
const BUBBLE_SIZE = 52;
const EDGE_MARGIN = 8;
// Below this, a touch/pointer move is just a tap wobble, not a drag —
// mirrors the longPress/tap distinction MeetingHub.tsx uses for message
// bubbles, so a normal click still opens the chat.
const DRAG_THRESHOLD = 6;

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

  // Horizontal drag position, as an offset from the right edge — applied
  // directly to the DOM during the drag (bypassing React) for a smooth
  // 60fps feel, then committed to state once on release so it survives
  // whatever re-renders a new unread message or ChatManager update causes.
  const containerRef = useRef<HTMLDivElement>(null);
  const [rightPx, setRightPx] = useState(16);
  const dragRef = useRef<{ startX: number; startRight: number; dragging: boolean; bubbleId: string | null } | null>(null);
  const wasDraggingRef = useRef(false);

  function clampRight(right: number) {
    const width = typeof window !== "undefined" ? window.innerWidth : 0;
    const maxRight = Math.max(EDGE_MARGIN, width - BUBBLE_SIZE - EDGE_MARGIN);
    return Math.min(maxRight, Math.max(EDGE_MARGIN, right));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const bubbleId = (e.target as HTMLElement).closest("button[data-bubble-id]")?.getAttribute("data-bubble-id") ?? null;
    dragRef.current = { startX: e.clientX, startRight: rightPx, dragging: false, bubbleId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = e.clientX - drag.startX;
    if (!drag.dragging && Math.abs(deltaX) < DRAG_THRESHOLD) return;
    drag.dragging = true;
    const nextRight = clampRight(drag.startRight - deltaX);
    if (containerRef.current) containerRef.current.style.right = `${nextRight}px`;
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.dragging) {
      const deltaX = e.clientX - drag.startX;
      setRightPx(clampRight(drag.startRight - deltaX));
    } else if (drag.bubbleId) {
      // setPointerCapture above retargets the container's own pointerup —
      // and with it, the browser's synthesized click — away from whichever
      // bubble button was actually tapped, so a plain tap's click handler
      // on the button below never fires. Opening the chat straight from
      // here (once we know it wasn't a drag) is what makes tapping a
      // bubble actually work instead of silently doing nothing.
      const profile = bubbles.find((p) => p.id === drag.bubbleId);
      if (profile) openChat(profile);
    }
    wasDraggingRef.current = drag.dragging;
    dragRef.current = null;
  }

  // An iPad rotation (or any viewport shrink) can otherwise leave the
  // bubble stranded off-screen if it was dragged near the old right edge.
  useEffect(() => {
    function handleResize() {
      setRightPx((prev) => clampRight(prev));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (bubbles.length === 0) return null;

  // ChatDock's open chat windows anchor to this exact same bottom-right
  // corner (bottom: 0, right: 24px, 380px tall — see ChatWindow.tsx) — with
  // no open windows, the bubble sits just above the mobile tab bar / the
  // screen edge on desktop as before; with any window open, it has to clear
  // that whole 380px regardless of how many windows are open side by side
  // (they only spread out horizontally), or it renders on top of one,
  // looking like a broken overlapping mess instead of two distinct pieces
  // of UI.
  const anyChatOpen = openChats.length > 0;

  return (
    <div
      ref={containerRef}
      className={`fixed z-40 flex flex-col-reverse items-end gap-2 touch-none select-none ${
        anyChatOpen ? "bottom-[456px] md:bottom-[404px]" : "bottom-[76px] md:bottom-4"
      }`}
      style={{ right: rightPx, cursor: "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {bubbles.map((p) => (
        <button
          key={p.id}
          type="button"
          data-bubble-id={p.id}
          onClick={() => {
            // Pointer taps are opened from handlePointerUp above instead
            // (see its comment) — this onClick only fires for keyboard
            // activation (Enter/Space), which never goes through the
            // pointer handlers at all. It also still swallows the stray
            // click a drag can produce, same as before.
            if (wasDraggingRef.current) {
              wasDraggingRef.current = false;
              return;
            }
            openChat(p);
          }}
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
              <img src={thumbnailUrl(p.avatar_url, 104)} alt="" draggable={false} className="w-full h-full object-cover" />
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
