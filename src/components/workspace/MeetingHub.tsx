"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { useChatManager } from "@/components/workspace/ChatManager";
import { DirectMessagesPanel } from "@/components/workspace/DirectMessagesPanel";
import { thumbnailUrl } from "@/lib/imageTransform";
import {
  addReaction,
  createChannel,
  deleteChannel,
  getChannelReads,
  getMeetingMessages,
  getReactions,
  joinChannel,
  leaveChannel,
  listChannels,
  markChannelRead,
  recallMeetingMessage,
  removeReaction,
  searchMeetingMessages,
  sendMeetingMessage,
} from "@/lib/actions/meetings";
import type {
  MeetingChannelPublic,
  MeetingChannelRead,
  MeetingMessage,
  MeetingReaction,
  MeetingSearchResult,
  Profile,
} from "@/lib/types";

const ROOM_ICONS = ["💬", "🎨", "📚", "🎬", "🧵", "🛠", "📣", "🎯"];

// A pseudo-room id for the "Riêng" (1:1) tab in the room list — not a real
// meeting_channels row, just a sentinel activeId value that swaps the main
// panel over to DirectMessagesPanel instead of a channel's messages.
const DM_TAB_ID = "__dm__";

const EMOJI_OPTIONS = [
  "😀", "😂", "😅", "😍", "😉", "😎", "🤔", "😢",
  "😭", "😡", "🥳", "😴", "😱", "🙌", "👀", "🤝",
  "👍", "👎", "👏", "🙏", "💪", "🔥", "✅", "❌",
  "🎉", "❤️", "💯", "😘", "🐶", "🐱",
];

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];

function formatTime(date: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function isImage(mime: string | null) {
  return !!mime && mime.startsWith("image/");
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

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Renders message text with URLs auto-linked and any "@Display Name" that
// matches a real teammate highlighted — good enough without a rich-text
// editor or a real mention-notification pipeline.
function renderContent(text: string, namesPattern: string | null, mine: boolean) {
  const namesAlt = namesPattern ? `${namesPattern}|` : "";
  const pattern = new RegExp(`(https?://[^\\s]+|@(?:${namesAlt}all\\b))`, "g");
  return text.split(pattern).map((part, i) => {
    if (!part) return null;
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noreferrer"
          style={{ color: mine ? "#fff" : "var(--color-accent-700)", textDecoration: "underline" }}
        >
          {part}
        </a>
      );
    }
    if (part.startsWith("@")) {
      const isAll = part === "@all";
      return (
        <strong
          key={i}
          className={isAll ? "px-1 rounded-[4px]" : undefined}
          style={{
            color: isAll ? "#fff" : mine ? "#ffe9d6" : "var(--color-accent-700)",
            background: isAll ? "var(--status-red)" : undefined,
          }}
        >
          {part}
        </strong>
      );
    }
    return part;
  });
}

function Avatar({ profile, size = 28 }: { profile: Pick<Profile, "display_name" | "avatar_url"> | undefined; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold flex-none overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.4, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
    >
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl(profile.avatar_url, Math.max(size * 2, 64))} alt="" className="w-full h-full object-cover" />
      ) : (
        (profile?.display_name ?? "?").charAt(0).toUpperCase()
      )}
    </span>
  );
}

function CreateRoomModal({
  onClose,
  onCreated,
  parentOptions,
  initialParentId,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  parentOptions: MeetingChannelPublic[];
  initialParentId?: string | null;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [locked, setLocked] = useState(false);
  const [icon, setIcon] = useState(ROOM_ICONS[0]);
  const [parentId, setParentId] = useState(initialParentId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (locked && !password.trim()) {
      setError("Nhập mật khẩu cho phòng riêng tư");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await createChannel(name, locked ? password : "", icon, parentId || null);
      onCreated(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={420}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2 className="text-lg">{initialParentId ? "Tạo phòng con" : "Tạo phòng mới"}</h2>

        {parentOptions.length > 0 && (
          <div className="field">
            <label htmlFor="room-parent">Thuộc phòng (tuỳ chọn)</label>
            <select id="room-parent" className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Không — phòng độc lập</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
            {parentId && (
              <p className="text-[11px] mt-1" style={{ color: "var(--color-neutral-500)" }}>
                Thành viên hiện tại của phòng đó sẽ tự động có mặt trong phòng con này.
              </p>
            )}
          </div>
        )}

        <div className="field">
          <label>Biểu tượng</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {ROOM_ICONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setIcon(e)}
                className="btn-icon"
                style={{
                  width: 34,
                  height: 34,
                  fontSize: 16,
                  background: icon === e ? "var(--color-accent-500)" : "var(--color-surface)",
                  border: `1.5px solid ${icon === e ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="room-name">Tên phòng *</label>
          <input
            id="room-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder="VD: Team Illustration"
            required
            autoFocus
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
          🔒 Đặt mật khẩu (phòng riêng tư)
        </label>

        {locked && (
          <div className="field">
            <label htmlFor="room-password">Mật khẩu</label>
            <input
              id="room-password"
              type="text"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mật khẩu để tham gia phòng"
            />
          </div>
        )}

        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-ghost" disabled={saving}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
            {saving ? "Đang tạo…" : "Tạo phòng"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BrowseRoomsModal({
  rooms,
  onClose,
  onJoined,
}: {
  rooms: MeetingChannelPublic[];
  onClose: () => void;
  onJoined: (id: string) => void;
}) {
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(id: string, pwd: string) {
    setBusyId(id);
    setError(null);
    try {
      await joinChannel(id, pwd);
      setPasswordFor(null);
      setPassword("");
      onJoined(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg">Khám phá phòng</h2>
        {rooms.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Không có phòng nào để tham gia.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rooms.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-[10px] px-3 py-2.5" style={{ background: "var(--color-surface)" }}>
                <div className="flex items-center gap-2">
                  <span aria-hidden>{r.icon}</span>
                  <span className="text-sm font-bold flex-1 truncate">{r.name}</span>
                  {r.has_password && <span aria-hidden title="Có mật khẩu">🔒</span>}
                  {passwordFor === r.id ? null : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm flex-none"
                      disabled={busyId === r.id}
                      onClick={() => (r.has_password ? setPasswordFor(r.id) : join(r.id, ""))}
                    >
                      {busyId === r.id ? "Đang vào…" : "Tham gia"}
                    </button>
                  )}
                </div>
                {passwordFor === r.id && (
                  <div className="flex items-center gap-2">
                    <input
                      className="input flex-1"
                      style={{ padding: "6px 10px", fontSize: 13 }}
                      type="text"
                      placeholder="Nhập mật khẩu"
                      value={password}
                      autoFocus
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm flex-none"
                      disabled={busyId === r.id}
                      onClick={() => join(r.id, password)}
                    >
                      Vào
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function MeetingHub({
  currentUser,
  profiles,
  initialChannels,
}: {
  currentUser: { id: string; display_name: string };
  profiles: Profile[];
  initialChannels: MeetingChannelPublic[];
}) {
  const { setActiveMeetingChannel, unreadCounts: dmUnreadCounts, meetingUnreadCounts } = useChatManager();
  const [channels, setChannels] = useState(initialChannels);
  const [activeId, setActiveId] = useState<string | null>(
    initialChannels.find((c) => c.is_general)?.id ?? initialChannels[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [reactions, setReactions] = useState<MeetingReaction[]>([]);
  const [reads, setReads] = useState<MeetingChannelRead[]>([]);
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  // Top-level rooms only (a sub-room can't itself have sub-rooms) that I'm
  // already in, since I'd need to be a member to see/nest under one anyway.
  const nestableRooms = useMemo(
    () => channels.filter((c) => c.joined && !c.is_general && !c.parent_channel_id),
    [channels],
  );
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(new Set());
  const [showBrowse, setShowBrowse] = useState(false);
  // The room list is a persistent column at sm+, but a full-screen overlay
  // on phones (no room for it beside the chat panel) — toggled from a
  // hamburger button in the chat panel's own header.
  const [showRoomListMobile, setShowRoomListMobile] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MeetingMessage | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MeetingSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Set when a search result is picked — the scroll-into-view effect below
  // watches for this element to actually exist (it may not yet, if we just
  // switched rooms and that room's messages are still loading).
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const lastMarkedReadIdRef = useRef<string | null>(null);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  // A real thumbnail of the pending image beats a filename chip — lets
  // people confirm it's the right screenshot before sending. Computed
  // during render (not in an effect) since it's a pure derivation of
  // pendingFile; the effect below only ever revokes it, never sets state.
  const pendingPreviewUrl = useMemo(() => {
    if (!pendingFile || !isImage(pendingFile.type)) return null;
    return URL.createObjectURL(pendingFile);
  }, [pendingFile]);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  useEffect(() => {
    notificationAudioRef.current = new Audio("/sounds/dm-message.mp3");
  }, []);

  // Tells the global tab-badge tracker which room is open right now, so it
  // doesn't count messages here as "unread" while the user is looking at
  // them — and clears on unmount so leaving /workspace/hop entirely doesn't
  // leave a room stuck marked "active" forever.
  useEffect(() => {
    setActiveMeetingChannel(activeId === DM_TAB_ID ? null : activeId);
    return () => setActiveMeetingChannel(null);
  }, [activeId, setActiveMeetingChannel]);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const joinedRooms = useMemo(() => channels.filter((c) => c.joined), [channels]);
  // Top-level rooms render in the list as usual; sub-rooms are grouped under
  // their parent instead, shown indented and only while that parent is
  // expanded — same "folder" pattern as the workspace's other tree views.
  const topLevelJoinedRooms = useMemo(() => joinedRooms.filter((c) => !c.parent_channel_id), [joinedRooms]);
  const childRoomsByParent = useMemo(() => {
    const map = new Map<string, MeetingChannelPublic[]>();
    for (const c of joinedRooms) {
      if (!c.parent_channel_id) continue;
      const list = map.get(c.parent_channel_id);
      if (list) list.push(c);
      else map.set(c.parent_channel_id, [c]);
    }
    return map;
  }, [joinedRooms]);
  const dmTotalUnread = useMemo(() => Object.values(dmUnreadCounts).reduce((sum, n) => sum + n, 0), [dmUnreadCounts]);
  const browsableRooms = useMemo(() => channels.filter((c) => !c.joined), [channels]);
  const activeChannel = channels.find((c) => c.id === activeId) ?? null;

  const namesPattern = useMemo(() => {
    const names = profiles
      .map((p) => p.display_name)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);
    return names.length > 0 ? names.join("|") : null;
  }, [profiles]);

  // Facebook-style read receipts: each teammate's little avatar trails
  // under whichever message is the last one *they've* seen — which can be
  // an older message if they're behind, not necessarily the newest one.
  const seenByMessageId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of reads) {
      if (r.profile_id === currentUser.id || !r.last_read_message_id) continue;
      const list = map.get(r.last_read_message_id);
      if (list) list.push(r.profile_id);
      else map.set(r.last_read_message_id, [r.profile_id]);
    }
    return map;
  }, [reads, currentUser.id]);

  const mentionMatch = /(^|\s)@([\p{L}0-9]*)$/u.exec(text);
  const mentionQuery = mentionMatch ? mentionMatch[2] : null;
  // "@all" pings everyone in the room the same way @-ing a real teammate
  // does — offered in the same dropdown whenever what's typed so far could
  // still lead to it.
  const showAllMentionOption = mentionQuery !== null && "all".startsWith(mentionQuery.toLowerCase());
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return profiles
      .filter((p) => p.display_name.toLowerCase().includes(q))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [mentionQuery, profiles]);

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  useEffect(() => {
    if (!showEmojiPicker && !reactionPickerFor) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
        setReactionPickerFor(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker, reactionPickerFor]);

  // Re-fetches messages/reactions/reads for the active channel and replaces
  // local state wholesale — the realtime subscription below can silently
  // miss an INSERT sent while the websocket was disconnected (phone screen
  // locked, tab backgrounded, a network blip...), which showed up to staff
  // as a push notification arriving but the message itself never appearing
  // until a manual reload. Called on room switch, on tab focus/visibility,
  // and whenever the channel below (re)subscribes. Guards against a slow
  // fetch for a room the user has since switched away from resolving late
  // and clobbering whatever the current room already loaded.
  const resync = useCallback(() => {
    const id = activeId;
    if (!id || id === DM_TAB_ID) return;
    getMeetingMessages(id)
      .then((msgs) => {
        if (activeIdRef.current !== id) return undefined;
        setMessages(msgs);
        return getReactions(msgs.map((m) => m.id));
      })
      .then((rx) => {
        if (rx && activeIdRef.current === id) setReactions(rx);
      })
      .catch(() => {
        if (activeIdRef.current === id) {
          setMessages([]);
          setReactions([]);
        }
      });
    getChannelReads(id)
      .then((rd) => {
        if (activeIdRef.current === id) setReads(rd);
      })
      .catch(() => {
        if (activeIdRef.current === id) setReads([]);
      });
  }, [activeId]);

  useEffect(() => {
    lastMarkedReadIdRef.current = null;
    resync();
  }, [resync]);

  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState === "visible") resync();
    }
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", resync);
    };
  }, [resync]);

  // Mark the newest message in the currently-open channel as "seen by me" —
  // fires again whenever a fresh message arrives while the channel stays
  // open, same as Messenger updating your read position live. No local
  // state to update here: the "seen by" row under a message only ever
  // shows other people, never yourself, so this is pure fire-and-forget.
  useEffect(() => {
    if (!activeId || activeId === DM_TAB_ID || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMarkedReadIdRef.current === lastMessage.id) return;
    lastMarkedReadIdRef.current = lastMessage.id;
    markChannelRead(activeId, lastMessage.id).catch(() => {});
  }, [activeId, messages]);

  useEffect(() => {
    if (!activeId || activeId === DM_TAB_ID) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`meeting-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_messages", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const row = payload.new as MeetingMessage;
          if (row.sender_id !== currentUser.id) {
            const audio = notificationAudioRef.current;
            if (audio) {
              audio.currentTime = 0;
              audio.play().catch(() => {});
            }
          }
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "meeting_messages" },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_message_reactions" },
        (payload) => {
          const row = payload.new as MeetingReaction;
          if (!messageIdsRef.current.has(row.message_id)) return;
          setReactions((prev) =>
            prev.some((r) => r.message_id === row.message_id && r.profile_id === row.profile_id && r.emoji === row.emoji)
              ? prev
              : [...prev, row],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "meeting_message_reactions" },
        (payload) => {
          const old = payload.old as { message_id: string; profile_id: string; emoji: string };
          setReactions((prev) =>
            prev.filter((r) => !(r.message_id === old.message_id && r.profile_id === old.profile_id && r.emoji === old.emoji)),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_channel_reads", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const row = payload.new as MeetingChannelRead;
          setReads((prev) => [...prev.filter((r) => r.profile_id !== row.profile_id), row]);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meeting_channel_reads", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const row = payload.new as MeetingChannelRead;
          setReads((prev) => [...prev.filter((r) => r.profile_id !== row.profile_id), row]);
        },
      )
      // Fires with "SUBSCRIBED" both on the initial connect and after any
      // reconnect — resyncing here is what catches up on messages that
      // arrived during a drop, since Realtime doesn't replay missed events.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") resync();
      });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [activeId, currentUser.id, resync]);

  // Keyed on activeId too, not just messages.length — switching to a room
  // whose message count happens to match the previous one wouldn't
  // otherwise re-trigger this, leaving the view stuck scrolled wherever it
  // was instead of jumping to that room's latest message.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [activeId, messages.length]);

  // Jumps to a picked search result once its message actually exists in the
  // DOM — runs again every time `messages` changes, which covers having
  // just switched rooms and still waiting on that room's fetch to resolve.
  // Declared after the scroll-to-bottom effect above so it wins when both
  // fire from the same messages update (switching into a room to jump to
  // a hit there triggers both).
  useEffect(() => {
    if (!scrollToMessageId) return;
    const el = document.getElementById(`meeting-msg-${scrollToMessageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("fk-flash-highlight");
    const flashTimer = setTimeout(() => el.classList.remove("fk-flash-highlight"), 1600);
    // Deferred rather than called synchronously in the effect body — this
    // clears the target once handled, not a value derivable during render.
    const raf = requestAnimationFrame(() => setScrollToMessageId(null));
    return () => {
      clearTimeout(flashTimer);
      cancelAnimationFrame(raf);
    };
  }, [messages, scrollToMessageId]);

  // Debounced live search across every room the user is in. Doesn't bother
  // resetting searchResults/searching when the query gets too short — the
  // render below already hides stale results behind the same length check.
  useEffect(() => {
    if (!showSearch || searchQuery.trim().length < 2) return;
    const handle = setTimeout(() => {
      searchMeetingMessages(searchQuery)
        .then((results) => setSearchResults(results))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [showSearch, searchQuery]);

  function pickSearchResult(result: MeetingSearchResult) {
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setShowRoomListMobile(false);
    setScrollToMessageId(result.id);
    if (result.channel_id !== activeId) selectChannel(result.channel_id);
  }

  function refreshChannel(id: string, patch: Partial<MeetingChannelPublic>) {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  // A reply-in-progress only makes sense in the channel it was started in.
  function selectChannel(id: string | null) {
    setReplyingTo(null);
    setActiveId(id);
    setShowRoomListMobile(false);
  }

  async function handleCreated(id: string) {
    const fresh = await listChannels().catch(() => null);
    if (fresh) setChannels(fresh);
    selectChannel(id);
  }

  function toggleRoomExpanded(id: string) {
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleJoined(id: string) {
    refreshChannel(id, { joined: true });
    setShowBrowse(false);
    selectChannel(id);
  }

  async function handleLeave(id: string) {
    if (!confirm("Rời khỏi phòng này?")) return;
    await leaveChannel(id);
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, joined: false } : c)));
    if (activeId === id) {
      selectChannel(channels.find((c) => c.is_general)?.id ?? null);
    }
  }

  async function handleDelete(id: string) {
    const childIds = channels.filter((c) => c.parent_channel_id === id).map((c) => c.id);
    const warning =
      childIds.length > 0
        ? `Xoá phòng này? Toàn bộ tin nhắn và ${childIds.length} phòng con bên trong sẽ mất.`
        : "Xoá phòng này? Toàn bộ tin nhắn sẽ mất.";
    if (!confirm(warning)) return;
    await deleteChannel(id);
    const removedIds = new Set([id, ...childIds]);
    setChannels((prev) => prev.filter((c) => !removedIds.has(c.id)));
    if (activeId && removedIds.has(activeId)) {
      selectChannel(channels.find((c) => c.is_general)?.id ?? null);
    }
  }

  async function handleRecallMessage(id: string) {
    if (!confirm("Thu hồi tin nhắn này? Mọi người sẽ thấy \"Đã thu hồi\" thay cho nội dung.")) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, is_recalled: true, content: "", attachment_url: null } : m)));
    try {
      await recallMeetingMessage(id);
    } catch {
      // best effort — a realtime UPDATE (or the next channel switch) will
      // reconcile if this silently failed server-side
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const already = reactions.some(
      (r) => r.message_id === messageId && r.profile_id === currentUser.id && r.emoji === emoji,
    );
    setReactions((prev) =>
      already
        ? prev.filter((r) => !(r.message_id === messageId && r.profile_id === currentUser.id && r.emoji === emoji))
        : [...prev, { message_id: messageId, profile_id: currentUser.id, emoji, created_at: new Date().toISOString() }],
    );
    setReactionPickerFor(null);
    try {
      if (already) await removeReaction(messageId, emoji);
      else await addReaction(messageId, emoji);
    } catch {
      // optimistic update may drift from the server on failure — next
      // channel load or a realtime event from another tab will correct it
    }
  }

  // iPad/tablet: there's no hover, so the small 😊/↩/✕ row never reveals
  // itself, and tapping a bubble just triggers iOS's native text-selection
  // callout. A finger-or-pen press-and-hold on the bubble opens the quick
  // reaction picker instead — same gesture as iMessage/Messenger. Mouse
  // users already have the hover row, so this only arms for touch/pen.
  function handleBubblePressStart(e: React.PointerEvent, messageId: string) {
    if (e.pointerType === "mouse") return;
    // A press directly on the message text is left alone — native
    // selection/copy still works there. Only a press on the bubble's own
    // padding (background, not the text itself) arms the reaction picker.
    if ((e.target as HTMLElement).closest(".fk-message-text")) return;
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setShowEmojiPicker(false);
      setReactionPickerFor(messageId);
    }, 450);
  }

  function cancelBubblePress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // Lets a screenshot copied to the clipboard (or any image, really) go
  // straight into the composer with Ctrl+V, same as Slack/Messenger — no
  // need to save it to disk first and use the 📎 picker. Checks
  // clipboardData.files first (the simplest, most broadly-supported path
  // for an actual image file on the clipboard) and only falls back to
  // walking clipboardData.items — which some screenshot tools use instead,
  // and which isn't reliably array-iterable across browsers, hence
  // Array.from() rather than for...of — if that comes up empty.
  // Grows the composer with the message instead of scrolling the text
  // sideways in a single line, so a long message stays readable before
  // sending — capped so it doesn't take over the whole screen.
  useEffect(() => {
    const el = textInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    let file: File | null = null;

    if (clipboardData.files && clipboardData.files.length > 0) {
      file = Array.from(clipboardData.files).find((f) => f.type.startsWith("image/")) ?? null;
    }

    if (!file && clipboardData.items) {
      for (const item of Array.from(clipboardData.items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          file = item.getAsFile();
          if (file) break;
        }
      }
    }

    if (!file) return;

    e.preventDefault();
    if (file.size > 20 * 1024 * 1024) {
      setError("Tệp vượt quá 20MB");
      return;
    }
    setError(null);
    setPendingFile(file);
  }

  function pickMention(p: Profile) {
    setText((prev) => prev.replace(/(^|\s)@([\p{L}0-9]*)$/u, (_m, pre: string) => `${pre}@${p.display_name} `));
    textInputRef.current?.focus();
  }

  function pickAllMention() {
    setText((prev) => prev.replace(/(^|\s)@([\p{L}0-9]*)$/u, (_m, pre: string) => `${pre}@all `));
    textInputRef.current?.focus();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId) return;
    const trimmed = text.trim();
    const file = pendingFile;
    if (!trimmed && !file) return;
    const replyId = replyingTo?.id ?? null;
    setSending(true);
    setError(null);
    setText("");
    setPendingFile(null);
    setReplyingTo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      let formData: FormData | undefined;
      if (file) {
        formData = new FormData();
        formData.append("file", file);
      }
      const sent = await sendMeetingMessage(activeId, trimmed, formData, replyId);
      if (sent) setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể gửi tin nhắn.");
      setText(trimmed);
      setPendingFile(file ?? null);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Room list — a persistent column at sm+, a full-screen overlay on phones */}
      <div
        className={`${showRoomListMobile ? "flex fixed inset-0 z-40" : "hidden"} sm:flex sm:static sm:z-auto flex-col gap-3 px-3 py-4 sm:w-[240px] sm:flex-none`}
        style={{ borderRight: "1px solid var(--color-neutral-200)", background: "var(--color-bg)" }}
      >
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: "var(--color-neutral-500)" }}>
            PHÒNG HỌP
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setShowCreate(true)} className="btn-icon" style={{ width: 24, height: 24, padding: 0 }} aria-label="Tạo phòng">
              ＋
            </button>
            <button
              type="button"
              onClick={() => setShowRoomListMobile(false)}
              className="btn-icon sm:hidden"
              style={{ width: 24, height: 24, padding: 0 }}
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto flex-1">
          {topLevelJoinedRooms.map((r) => {
            const roomUnread = meetingUnreadCounts[r.id] ?? 0;
            const children = childRoomsByParent.get(r.id) ?? [];
            const expanded = expandedRoomIds.has(r.id);
            return (
            <div key={r.id} className="contents">
              <div className="flex items-center gap-0.5">
                {children.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleRoomExpanded(r.id)}
                    className="btn-icon flex-none"
                    style={{ width: 18, height: 18, padding: 0, fontSize: 10 }}
                    aria-label={expanded ? "Thu gọn phòng con" : "Xổ phòng con"}
                  >
                    {expanded ? "▾" : "▸"}
                  </button>
                ) : (
                  <span className="flex-none" style={{ width: 18 }} />
                )}
                <button
                  type="button"
                  onClick={() => selectChannel(r.id)}
                  className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-left text-[13px] font-semibold flex-1 min-w-0"
                  style={{
                    background: activeId === r.id ? "var(--color-accent-100)" : undefined,
                    color: activeId === r.id ? "var(--color-accent-700)" : "var(--color-text)",
                  }}
                >
                  <span aria-hidden>{r.icon}</span>
                  <span className="flex-1 truncate">{r.name}</span>
                  {r.has_password && !r.is_general && (
                    <span aria-hidden style={{ fontSize: 11 }}>🔒</span>
                  )}
                  {roomUnread > 0 && (
                    <span
                      className="flex items-center justify-center rounded-full font-bold flex-none"
                      style={{ minWidth: 16, height: 16, padding: "0 4px", fontSize: 9, background: "var(--status-red)", color: "#fff" }}
                    >
                      {roomUnread > 9 ? "9+" : roomUnread}
                    </span>
                  )}
                </button>
              </div>
              {expanded &&
                children.map((child) => {
                  const childUnread = meetingUnreadCounts[child.id] ?? 0;
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => selectChannel(child.id)}
                      className="ws-nav-link flex items-center gap-2 py-2 rounded-[8px] text-left text-[13px] font-semibold"
                      style={{
                        marginLeft: 26,
                        paddingLeft: 8,
                        paddingRight: 8,
                        background: activeId === child.id ? "var(--color-accent-100)" : undefined,
                        color: activeId === child.id ? "var(--color-accent-700)" : "var(--color-text)",
                      }}
                    >
                      <span aria-hidden>{child.icon}</span>
                      <span className="flex-1 truncate">{child.name}</span>
                      {child.has_password && (
                        <span aria-hidden style={{ fontSize: 11 }}>🔒</span>
                      )}
                      {childUnread > 0 && (
                        <span
                          className="flex items-center justify-center rounded-full font-bold flex-none"
                          style={{ minWidth: 16, height: 16, padding: "0 4px", fontSize: 9, background: "var(--status-red)", color: "#fff" }}
                        >
                          {childUnread > 9 ? "9+" : childUnread}
                        </span>
                      )}
                    </button>
                  );
                })}
              {r.is_general && (
                <button
                  type="button"
                  onClick={() => selectChannel(DM_TAB_ID)}
                  className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-left text-[13px] font-semibold"
                  style={{
                    background: activeId === DM_TAB_ID ? "var(--color-accent-100)" : undefined,
                    color: activeId === DM_TAB_ID ? "var(--color-accent-700)" : "var(--color-text)",
                  }}
                >
                  <span aria-hidden>👤</span>
                  <span className="flex-1 truncate">Riêng</span>
                  {dmTotalUnread > 0 && (
                    <span
                      className="flex items-center justify-center rounded-full font-bold flex-none"
                      style={{ minWidth: 16, height: 16, padding: "0 4px", fontSize: 9, background: "var(--status-red)", color: "#fff" }}
                    >
                      {dmTotalUnread > 9 ? "9+" : dmTotalUnread}
                    </span>
                  )}
                </button>
              )}
            </div>
            );
          })}
        </div>
        <button type="button" onClick={() => setShowBrowse(true)} className="btn btn-secondary btn-sm w-full">
          🔍 Khám phá phòng
          {browsableRooms.length > 0 && ` (${browsableRooms.length})`}
        </button>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeId === DM_TAB_ID ? (
          <DirectMessagesPanel
            currentUser={currentUser}
            profiles={profiles}
            onOpenRoomList={() => setShowRoomListMobile(true)}
          />
        ) : !activeChannel ? (
          <div className="flex-1 flex flex-col">
            <button
              type="button"
              onClick={() => setShowRoomListMobile(true)}
              className="btn-icon sm:hidden m-3"
              style={{ width: 28, height: 28, padding: 0 }}
              aria-label="Danh sách phòng"
            >
              ☰
            </button>
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--color-neutral-500)" }}>
              Chọn hoặc tạo một phòng để bắt đầu trò chuyện.
            </div>
          </div>
        ) : (
          <>
            <div
              className="flex-none flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
            >
              <button
                type="button"
                onClick={() => setShowRoomListMobile(true)}
                className="btn-icon sm:hidden flex-none"
                style={{ width: 28, height: 28, padding: 0 }}
                aria-label="Danh sách phòng"
              >
                ☰
              </button>
              <span aria-hidden style={{ fontSize: 18 }}>{activeChannel.icon}</span>
              <span className="flex-1 min-w-0 flex flex-col">
                {activeChannel.parent_channel_id && (
                  <span className="text-[10px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                    ↳ {channels.find((c) => c.id === activeChannel.parent_channel_id)?.name ?? ""}
                  </span>
                )}
                <span className="font-bold truncate">{activeChannel.name}</span>
              </span>
              {!activeChannel.is_general && !activeChannel.parent_channel_id && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateParentId(activeChannel.id);
                    setShowCreate(true);
                  }}
                  className="btn-icon flex-none"
                  style={{ width: 30, height: 30, padding: 0 }}
                  aria-label="Tạo phòng con"
                  title="Tạo phòng con trong phòng này"
                >
                  ➕
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSearch((v) => !v)}
                className="btn-icon flex-none"
                style={{ width: 30, height: 30, padding: 0 }}
                aria-label="Tìm kiếm tin nhắn"
                title="Tìm kiếm tin nhắn"
              >
                🔍
              </button>
              {!activeChannel.is_general && (
                <>
                  <button type="button" onClick={() => handleLeave(activeChannel.id)} className="btn btn-ghost btn-sm">
                    Rời phòng
                  </button>
                  {activeChannel.created_by === currentUser.id && (
                    <button type="button" onClick={() => handleDelete(activeChannel.id)} className="btn btn-danger btn-sm">
                      Xoá phòng
                    </button>
                  )}
                </>
              )}
            </div>

            {showSearch && (
              <div className="flex-none flex flex-col" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                <div className="flex items-center gap-2 px-4 py-2">
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (e.target.value.trim().length >= 2) setSearching(true);
                    }}
                    placeholder="Tìm tin nhắn trong Trò chuyện & họp… (mọi phòng)"
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
                    style={{ width: 28, height: 28, padding: 0 }}
                    aria-label="Đóng tìm kiếm"
                  >
                    ✕
                  </button>
                </div>
                {searchQuery.trim().length >= 2 && (
                  <div className="overflow-y-auto" style={{ maxHeight: 320, borderTop: "1px solid var(--color-neutral-200)" }}>
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
                        const sender = profileById.get(r.sender_id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => pickSearchResult(r)}
                            className="ws-nav-link flex items-start gap-2.5 px-4 py-2 text-left w-full"
                          >
                            <Avatar profile={sender} size={26} />
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-1.5">
                                <span className="text-[12px] font-bold">{sender?.display_name ?? "Ẩn danh"}</span>
                                <span className="tag tag-neutral" style={{ fontSize: 9 }}>
                                  {r.channel_icon} {r.channel_name}
                                </span>
                              </span>
                              <span className="block text-[12px] truncate" style={{ color: "var(--color-neutral-600)" }}>
                                {highlightMatch(r.content, searchQuery)}
                              </span>
                            </span>
                            <span className="text-[10px] flex-none" style={{ color: "var(--color-neutral-500)" }}>
                              {formatTime(r.created_at)}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col p-4">
              {messages.length === 0 && (
                <p className="text-[13px] text-center mt-4" style={{ color: "var(--color-neutral-500)" }}>
                  Chưa có tin nhắn nào trong phòng này.
                </p>
              )}
              {messages.map((m, index) => {
                const sender = profileById.get(m.sender_id);
                // Zalo/Messenger-style grouping: consecutive messages from the
                // same person within a few minutes only show the avatar/name
                // once, with tight spacing between them — the repeated
                // avatar + name + full gap on every single message (even
                // several in a row from the same person seconds apart) was
                // exactly the "too much dead space" staff were pointing out.
                const prev = index > 0 ? messages[index - 1] : null;
                const next = index < messages.length - 1 ? messages[index + 1] : null;
                const isGroupStart =
                  !prev ||
                  prev.sender_id !== m.sender_id ||
                  new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
                // Same idea in reverse — only the last message of a run shows
                // its time, like Zalo/Messenger, instead of repeating it under
                // every single message in the group.
                const isGroupEnd =
                  !next ||
                  next.sender_id !== m.sender_id ||
                  new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > 5 * 60 * 1000;
                const mine = m.sender_id === currentUser.id;
                const msgReactions = reactions.filter((r) => r.message_id === m.id);
                const grouped = msgReactions.reduce<Record<string, string[]>>((acc, r) => {
                  (acc[r.emoji] ??= []).push(r.profile_id);
                  return acc;
                }, {});
                const seenBy = seenByMessageId.get(m.id) ?? [];
                const quoted = m.reply_to_message_id ? messageById.get(m.reply_to_message_id) : undefined;
                const quotedSender = quoted ? profileById.get(quoted.sender_id) : undefined;

                const actionButtons = (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingTo(m);
                        textInputRef.current?.focus();
                      }}
                      className="btn-icon"
                      style={{ width: 20, height: 20, padding: 0, fontSize: 11 }}
                      aria-label="Trả lời tin nhắn"
                    >
                      ↩
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmojiPicker(false);
                        setReactionPickerFor(reactionPickerFor === m.id ? null : m.id);
                      }}
                      className="btn-icon"
                      style={{ width: 20, height: 20, padding: 0, fontSize: 11 }}
                      aria-label="Thả cảm xúc"
                    >
                      😊
                    </button>
                    {mine && !m.is_recalled && (
                      <button
                        type="button"
                        onClick={() => handleRecallMessage(m.id)}
                        className="btn-icon"
                        style={{ width: 20, height: 20, padding: 0, fontSize: 10 }}
                        aria-label="Thu hồi tin nhắn"
                        title="Thu hồi tin nhắn"
                      >
                        ✕
                      </button>
                    )}
                    {reactionPickerFor === m.id && (
                      <div
                        ref={popoverRef}
                        className="card elev-lg flex items-center gap-1 p-1.5"
                        style={{ position: "absolute", bottom: "100%", [mine ? "right" : "left"]: 0, marginBottom: 6, zIndex: 10 }}
                      >
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => toggleReaction(m.id, emoji)}
                            className="btn-icon"
                            style={{ width: 26, height: 26, padding: 0, fontSize: 15 }}
                            aria-label={emoji}
                          >
                            {emoji}
                          </button>
                        ))}
                        {m.content && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(m.content).catch(() => {});
                              setReactionPickerFor(null);
                            }}
                            className="btn-icon"
                            style={{ width: 26, height: 26, padding: 0, fontSize: 13 }}
                            aria-label="Sao chép"
                            title="Sao chép"
                          >
                            📋
                          </button>
                        )}
                      </div>
                    )}
                  </>
                );

                return (
                  <div
                    key={m.id}
                    id={`meeting-msg-${m.id}`}
                    className={`group flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}
                    style={{ marginTop: isGroupStart ? 12 : 2 }}
                  >
                    {isGroupStart ? <Avatar profile={sender} /> : <span className="flex-none" style={{ width: 28 }} />}
                    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} max-w-[75%]`}>
                      {isGroupStart && (
                        <span className="text-[11px] font-semibold mb-0.5" style={{ color: "var(--color-neutral-500)" }}>
                          {mine ? "Bạn" : (sender?.display_name ?? "Ẩn danh")}
                        </span>
                      )}
                      {m.is_recalled ? (
                        <div
                          className="rounded-[12px] px-3 py-2 text-sm italic"
                          style={{ background: "var(--color-surface)", color: "var(--color-neutral-500)" }}
                        >
                          Đã thu hồi
                        </div>
                      ) : (
                        <>
                      {m.reply_to_message_id && (
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(`meeting-msg-${m.reply_to_message_id}`);
                            el?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                          className="flex flex-col text-left rounded-[8px] px-2.5 py-1.5 mb-1 max-w-full"
                          style={{
                            background: "var(--color-surface)",
                            borderLeft: "3px solid var(--color-accent-500)",
                          }}
                        >
                          <span className="text-[11px] font-bold" style={{ color: "var(--color-accent-700)" }}>
                            {quoted ? (quotedSender?.display_name ?? "Ẩn danh") : "Tin nhắn gốc"}
                          </span>
                          <span className="text-[11px] truncate" style={{ color: "var(--color-neutral-500)", maxWidth: 220 }}>
                            {quoted ? (quoted.is_recalled ? "Đã thu hồi" : quoted.content || (quoted.attachment_url ? "📎 Tệp đính kèm" : "")) : "Đã bị xoá"}
                          </span>
                        </button>
                      )}
                      {m.content && (
                        <div className={`flex items-end gap-1 min-w-0 ${mine ? "flex-row-reverse" : ""}`}>
                          <div
                            className="min-w-0 rounded-[12px] px-3 py-2 text-[17px] whitespace-pre-wrap break-words"
                            style={{
                              background: mine ? "var(--color-accent-500)" : "var(--color-surface)",
                              color: mine ? "#fff" : "var(--color-text)",
                            }}
                            onPointerDown={(e) => handleBubblePressStart(e, m.id)}
                            onPointerUp={cancelBubblePress}
                            onPointerLeave={cancelBubblePress}
                            onPointerCancel={cancelBubblePress}
                            onContextMenu={(e) => {
                              if (longPressFiredRef.current) e.preventDefault();
                            }}
                          >
                            <span className="fk-message-text">{renderContent(m.content, namesPattern, mine)}</span>
                          </div>
                          <span className="fk-msg-actions relative inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-none">
                            {actionButtons}
                          </span>
                        </div>
                      )}
                      {m.attachment_url &&
                        (isImage(m.attachment_mime) ? (
                          <a href={m.attachment_url} target="_blank" rel="noreferrer" className="mt-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbnailUrl(m.attachment_url, 480)}
                              alt={m.attachment_filename ?? ""}
                              className="rounded-[10px] object-cover"
                              style={{ maxWidth: 240, maxHeight: 240 }}
                            />
                          </a>
                        ) : (
                          <a
                            href={m.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold"
                            style={{ background: "var(--color-surface)", color: "var(--color-accent-700)" }}
                          >
                            📄 {m.attachment_filename}
                          </a>
                        ))}

                      {Object.keys(grouped).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(grouped).map(([emoji, ids]) => {
                            const reactedByMe = ids.includes(currentUser.id);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => toggleReaction(m.id, emoji)}
                                className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                                style={{
                                  background: reactedByMe ? "var(--color-accent-100)" : "var(--color-surface)",
                                  border: `1px solid ${reactedByMe ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                                }}
                                title={ids.map((id) => profileById.get(id)?.display_name ?? "").filter(Boolean).join(", ")}
                              >
                                <span aria-hidden>{emoji}</span>
                                {ids.length}
                              </button>
                            );
                          })}
                        </div>
                      )}
                        </>
                      )}

                      {(isGroupEnd || (!m.content && !m.is_recalled)) && (
                        <span className="flex items-center gap-1.5 mt-0.5">
                          {isGroupEnd && (
                            <span className="text-[10px]" style={{ color: "var(--color-neutral-500)" }}>
                              {formatTime(m.created_at)}
                            </span>
                          )}
                          {!m.content && !m.is_recalled && (
                            <span className="fk-msg-actions relative inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {actionButtons}
                            </span>
                          )}
                        </span>
                      )}
                      {seenBy.length > 0 && (
                        <span className="flex items-center -space-x-1 mt-0.5" title={seenBy.map((id) => profileById.get(id)?.display_name ?? "").filter(Boolean).join(", ")}>
                          {seenBy.map((id) => (
                            <Avatar key={id} profile={profileById.get(id)} size={14} />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex-none" style={{ borderTop: "1px solid var(--color-neutral-200)", position: "relative" }}>
              {(mentionCandidates.length > 0 || showAllMentionOption) && (
                <div
                  className="card elev-lg flex flex-col p-1.5 overflow-y-auto"
                  style={{ position: "absolute", bottom: "100%", left: 12, marginBottom: 6, width: 220, maxHeight: 260, zIndex: 10 }}
                >
                  {showAllMentionOption && (
                    <button
                      type="button"
                      onClick={pickAllMention}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-left text-[13px] font-semibold ws-nav-link"
                    >
                      <span
                        className="flex items-center justify-center rounded-full font-bold flex-none"
                        style={{ width: 22, height: 22, fontSize: 11, background: "var(--status-red)", color: "#fff" }}
                      >
                        📢
                      </span>
                      Tất cả mọi người
                    </button>
                  )}
                  {mentionCandidates.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickMention(p)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-left text-[13px] font-semibold ws-nav-link"
                    >
                      <Avatar profile={p} size={22} />
                      {p.display_name}
                    </button>
                  ))}
                </div>
              )}
              {showEmojiPicker && (
                <div
                  ref={popoverRef}
                  className="card elev-lg"
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 44,
                    marginBottom: 6,
                    width: 216,
                    padding: 8,
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: 2,
                    zIndex: 10,
                  }}
                >
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setText((prev) => prev + emoji);
                        setShowEmojiPicker(false);
                        textInputRef.current?.focus();
                      }}
                      className="btn-icon"
                      style={{ width: 26, height: 26, padding: 0, fontSize: 15 }}
                      aria-label={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              {replyingTo && (
                <div className="flex items-center gap-2 px-4 pt-2">
                  <div
                    className="flex flex-col flex-1 min-w-0 rounded-[8px] px-2.5 py-1.5"
                    style={{ background: "var(--color-surface)", borderLeft: "3px solid var(--color-accent-500)" }}
                  >
                    <span className="text-[11px] font-bold" style={{ color: "var(--color-accent-700)" }}>
                      Đang trả lời {replyingTo.sender_id === currentUser.id ? "chính mình" : (profileById.get(replyingTo.sender_id)?.display_name ?? "Ẩn danh")}
                    </span>
                    <span className="text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                      {replyingTo.content || (replyingTo.attachment_url ? "📎 Tệp đính kèm" : "")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="btn-icon flex-none"
                    style={{ width: 22, height: 22, padding: 0, fontSize: 12 }}
                    aria-label="Bỏ trả lời"
                  >
                    ✕
                  </button>
                </div>
              )}
              {error && (
                <p className="text-[12px] font-semibold px-4 pt-2" style={{ color: "var(--status-red)" }}>
                  {error}
                </p>
              )}
              {pendingFile && (
                <div className="flex items-center gap-1.5 px-4 pt-2">
                  {pendingPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pendingPreviewUrl}
                      alt=""
                      className="rounded-[8px] object-cover flex-none"
                      style={{ width: 44, height: 44, border: "1px solid var(--color-neutral-200)" }}
                    />
                  ) : (
                    <span
                      className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] font-semibold truncate max-w-full"
                      style={{ background: "var(--color-surface)", color: "var(--color-accent-700)" }}
                    >
                      📄 {pendingFile.name}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPendingFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="btn-icon flex-none"
                    style={{ width: 22, height: 22, padding: 0, fontSize: 12 }}
                    aria-label="Bỏ tệp đính kèm"
                  >
                    ✕
                  </button>
                </div>
              )}
              <form ref={composerFormRef} onSubmit={handleSend} className="flex items-end gap-2 p-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-icon flex-none"
                  style={{ width: 34, height: 34, padding: 0 }}
                  aria-label="Gửi ảnh hoặc tệp"
                >
                  📎
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReactionPickerFor(null);
                    setShowEmojiPicker((v) => !v);
                  }}
                  className="btn-icon flex-none"
                  style={{ width: 34, height: 34, padding: 0 }}
                  aria-label="Chọn biểu tượng cảm xúc"
                >
                  😀
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 20 * 1024 * 1024) {
                      setError("Tệp vượt quá 20MB");
                      e.target.value = "";
                      return;
                    }
                    setError(null);
                    setPendingFile(f);
                  }}
                />
                <textarea
                  ref={textInputRef}
                  className="input flex-1 resize-none"
                  style={{ maxHeight: 160, overflowY: "auto" }}
                  rows={1}
                  placeholder={`Nhắn vào #${activeChannel.name}… (gõ @ để nhắc ai đó, dán ảnh bằng Ctrl+V)`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      composerFormRef.current?.requestSubmit();
                    }
                  }}
                />
                <button type="submit" disabled={sending} className="btn btn-primary flex-none">
                  Gửi
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateRoomModal
          onClose={() => {
            setShowCreate(false);
            setCreateParentId(null);
          }}
          onCreated={(id) => {
            if (createParentId) setExpandedRoomIds((prev) => new Set(prev).add(createParentId));
            handleCreated(id);
          }}
          parentOptions={nestableRooms}
          initialParentId={createParentId}
        />
      )}
      {showBrowse && (
        <BrowseRoomsModal rooms={browsableRooms} onClose={() => setShowBrowse(false)} onJoined={handleJoined} />
      )}
    </div>
  );
}
