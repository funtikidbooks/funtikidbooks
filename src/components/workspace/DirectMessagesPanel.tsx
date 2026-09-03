"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChatManager, useLiveProfiles } from "@/components/workspace/ChatManager";
import { DirectConversation } from "@/components/workspace/DirectConversation";
import { VideoCallModal } from "@/components/workspace/VideoCallModal";
import { searchDirectMessages } from "@/lib/actions/messages";
import { thumbnailUrl } from "@/lib/imageTransform";
import { useCallPresence } from "@/lib/useCallPresence";
import { usePresence } from "@/lib/usePresence";
import type { DirectMessageSearchResult, Profile } from "@/lib/types";

// Explicit timeZone — without it this reads the server's own timezone
// (UTC on Vercel) instead of Vietnam's, a real hydration-mismatch source;
// see MeetingHub.tsx's own comment on the same fix.
function formatTime(date: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(date));
}

// Bolds the first occurrence of the search query in a result's snippet —
// good enough for a one-line preview, no need to highlight every hit.
function highlightMatch(content: string, query: string) {
  const q = query.trim();
  if (!q) return content;
  const idx = content.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return content;
  return (
    <>
      {content.slice(0, idx)}
      <mark style={{ background: "var(--color-accent-100)", color: "var(--color-accent-700)", fontWeight: 700 }}>
        {content.slice(idx, idx + q.length)}
      </mark>
      {content.slice(idx + q.length)}
    </>
  );
}

// The "Riêng" tab inside Trò chuyện & họp — 1:1 chat rendered inline (full
// panel) instead of the small floating ChatWindow, with a rail of teammate
// avatars to pick who to talk to. Reuses the same DirectConversation body as
// the floating chat, so they stay in sync feature-for-feature.
//
// Below sm, there isn't room for both the rail and the conversation side by
// side, so it becomes a two-screen master-detail flow instead: the rail
// full-width until someone's picked, then the conversation full-width with
// a back arrow — same pattern as Messenger/Telegram's own mobile apps.
export function DirectMessagesPanel({
  currentUser,
  profiles: profilesProp,
  onOpenRoomList,
  initialPeerId,
  label,
}: {
  currentUser: Pick<Profile, "id" | "display_name">;
  profiles: Profile[];
  onOpenRoomList: () => void;
  initialPeerId?: string | null;
  label: string;
}) {
  const { unreadCounts, recentSenderOrder, clearDmUnread } = useChatManager();
  // Patched with any live profile edits (name/avatar) a colleague has made
  // since this page loaded — see useLiveProfiles.
  const profiles = useLiveProfiles(profilesProp);
  const onlineIds = usePresence(currentUser.id);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(initialPeerId ?? null);
  // Derived rather than stored — selectedPeerId is the only thing that
  // actually needs to survive across renders; looking the profile up fresh
  // each time means a live name/avatar edit shows up here immediately too,
  // instead of freezing whatever the peer looked like at selection time.
  const selectedPeer = useMemo(
    () => (selectedPeerId ? (profiles.find((p) => p.id === selectedPeerId) ?? null) : null),
    [selectedPeerId, profiles],
  );

  // Deep-linked in from a push notification click — clear that peer's
  // unread badge the same way clicking their row in the rail would, and
  // actually switch the open conversation. This panel stays mounted across
  // clicks that arrive while the DM tab is already open (only the room list
  // vs. this tab toggles mount/unmount, not clicks within it), so
  // `useState(initialPeerId ?? null)` above only ever captures the peer from
  // the click that first mounted it — later clicks need this effect to move
  // `selectedPeerId` over too, or the panel just silently keeps showing
  // whichever conversation was already open.
  useEffect(() => {
    if (!initialPeerId) return;
    clearDmUnread(initialPeerId);
    // Genuinely syncing with an external system (the URL a notification
    // click landed on), same reasoning as MeetingHub's own initialDmPeerId
    // effect — not state needlessly mirrored from other React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPeerId(initialPeerId);
  }, [initialPeerId, clearDmUnread]);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DirectMessageSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  // Sorted so both sides land on the same key regardless of who calls first.
  const dmCallRoomKey = selectedPeer ? `dm-${[currentUser.id, selectedPeer.id].sort().join("-")}` : null;
  const callParticipants = useCallPresence(dmCallRoomKey);
  const othersOnCall = callParticipants.filter((p) => p.id !== currentUser.id);

  const callRingAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const ring = new Audio("/sounds/call-ring.mp3");
    ring.loop = true;
    callRingAudioRef.current = ring;
  }, []);

  // "Từ chối" hides the banner (and stops the ring) for this specific call
  // without ending it for the peer — cleared automatically the moment a
  // fresh call starts (0 → >0 transition) or the selected peer changes, so
  // declining one call doesn't silently swallow the next one too.
  const [dismissedCallKey, setDismissedCallKey] = useState<string | null>(null);
  const prevOthersOnCallCountRef = useRef(0);
  useEffect(() => {
    if (prevOthersOnCallCountRef.current === 0 && othersOnCall.length > 0) {
      setDismissedCallKey(null);
    }
    prevOthersOnCallCountRef.current = othersOnCall.length;
  }, [othersOnCall.length]);
  const showCallBanner = othersOnCall.length > 0 && !showVideoCall && dismissedCallKey !== dmCallRoomKey;

  // Rings on loop for as long as the peer is on a call and I haven't joined
  // or declined it — stops the moment I join, decline, they hang up, or I
  // switch to a different conversation (callParticipants tracks only the
  // currently selected peer).
  useEffect(() => {
    const audio = callRingAudioRef.current;
    if (!audio) return;
    if (showCallBanner) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [showCallBanner]);

  // Debounced live search across every 1:1 conversation the user has. Doesn't
  // bother resetting searchResults/searching when the query gets too short —
  // the render below already hides stale results behind the same length check.
  useEffect(() => {
    if (!showSearch || searchQuery.trim().length < 2) return;
    const handle = setTimeout(() => {
      searchDirectMessages(searchQuery)
        .then((results) => setSearchResults(results))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [showSearch, searchQuery]);

  function pickSearchResult(result: DirectMessageSearchResult) {
    const peer = profileById.get(result.peer_id);
    if (!peer) return;
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setScrollToMessageId(result.id);
    setSelectedPeerId(peer.id);
    clearDmUnread(peer.id);
  }

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
      <div className={`${selectedPeer ? "flex" : "hidden"} sm:flex flex-1 flex-col min-w-0`}>
        {!selectedPeer ? (
          <div className="flex-1 flex items-center justify-center text-sm text-center px-4" style={{ color: "var(--color-neutral-500)" }}>
            Chọn một thành viên bên phải để bắt đầu trò chuyện riêng.
          </div>
        ) : (
          <>
            <div className="flex-none flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
              <button
                type="button"
                onClick={() => setSelectedPeerId(null)}
                className="btn-icon sm:hidden flex-none"
                style={{ width: 28, height: 28, padding: 0 }}
                aria-label="Quay lại danh sách"
              >
                ←
              </button>
              <span
                className="flex items-center justify-center rounded-full text-[11px] font-bold overflow-hidden flex-none"
                style={{ width: 28, height: 28, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
              >
                {selectedPeer.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailUrl(selectedPeer.avatar_url, 64)} alt="" className="w-full h-full object-cover" />
                ) : (
                  selectedPeer.display_name.charAt(0).toUpperCase()
                )}
              </span>
              <span className="font-bold flex-1 truncate">{selectedPeer.display_name}</span>
            </div>
            {showCallBanner && (
              <div
                className="flex-none flex items-center gap-2 px-4 py-2"
                style={{ background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
              >
                <span
                  className="rounded-full flex-none"
                  style={{ width: 7, height: 7, background: "var(--status-red)" }}
                  aria-hidden
                />
                <span className="text-[13px] font-semibold flex-1 truncate">📹 {selectedPeer.display_name} đang gọi video</span>
                <button
                  type="button"
                  onClick={() => setDismissedCallKey(dmCallRoomKey)}
                  className="btn btn-secondary btn-sm flex-none"
                >
                  Từ chối
                </button>
                <button type="button" onClick={() => setShowVideoCall(true)} className="btn btn-primary btn-sm flex-none">
                  Tham gia
                </button>
              </div>
            )}
            <DirectConversation
              peer={selectedPeer}
              currentUser={currentUser}
              scrollToMessageId={scrollToMessageId}
              onScrolledTo={() => setScrollToMessageId(null)}
              onCallClick={() => setShowVideoCall(true)}
            />
            {showVideoCall && (
              <VideoCallModal
                roomKey={dmCallRoomKey!}
                label={`📹 ${selectedPeer.display_name}`}
                selfId={currentUser.id}
                displayName={currentUser.display_name}
                onClose={() => setShowVideoCall(false)}
              />
            )}
          </>
        )}
      </div>

      <div
        className={`${selectedPeer ? "hidden" : "flex"} sm:flex w-full sm:w-[220px] flex-none flex-col gap-0.5 overflow-y-auto py-2 px-1.5`}
        style={{ borderLeft: "1px solid var(--color-neutral-200)" }}
      >
        <div className="flex items-center gap-2 px-1.5 pb-2">
          <button
            type="button"
            onClick={onOpenRoomList}
            className="btn-icon sm:hidden flex-none"
            style={{ width: 28, height: 28, padding: 0 }}
            aria-label="Danh sách phòng"
          >
            ☰
          </button>
          <span className="text-[13px] font-bold flex-1">{label}</span>
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className="btn-icon flex-none"
            style={{ width: 30, height: 30, padding: 0, fontSize: 15 }}
            aria-label="Tìm kiếm tin nhắn"
            title="Tìm kiếm tin nhắn"
          >
            🔍
          </button>
        </div>

        {showSearch && (
          <div className="flex flex-col" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
            <div className="flex items-center gap-1.5 px-1.5 pb-2">
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim().length >= 2) setSearching(true);
                }}
                placeholder="Tìm tin nhắn riêng…"
                className="input flex-1"
                style={{ padding: "6px 10px", fontSize: 13 }}
              />
              <button
                type="button"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                }}
                className="btn-icon flex-none"
                style={{ width: 26, height: 26, padding: 0 }}
                aria-label="Đóng tìm kiếm"
              >
                ✕
              </button>
            </div>
            {searchQuery.trim().length >= 2 && (
              <div className="overflow-y-auto pb-2" style={{ maxHeight: 320 }}>
                {searching ? (
                  <p className="text-[12px] text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                    Đang tìm…
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="text-[12px] text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                    Không tìm thấy tin nhắn nào.
                  </p>
                ) : (
                  searchResults.map((r) => {
                    const peer = profileById.get(r.peer_id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pickSearchResult(r)}
                        className="ws-nav-link flex flex-col items-start gap-0.5 px-2 py-1.5 text-left w-full rounded-[8px]"
                      >
                        <span className="flex items-center gap-1.5 w-full">
                          <span className="text-[12px] font-bold truncate flex-1">{peer?.display_name ?? "Ẩn danh"}</span>
                          <span className="text-[10px] flex-none" style={{ color: "var(--color-neutral-500)" }}>
                            {formatTime(r.created_at)}
                          </span>
                        </span>
                        <span className="block text-[12px] truncate w-full" style={{ color: "var(--color-neutral-600)" }}>
                          {highlightMatch(r.content, searchQuery)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {showSearch ? null : teammates.length === 0 ? (
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
                  setSelectedPeerId(p.id);
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
                      <img src={thumbnailUrl(p.avatar_url, 64)} alt="" className="w-full h-full object-cover" />
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
    </div>
  );
}
