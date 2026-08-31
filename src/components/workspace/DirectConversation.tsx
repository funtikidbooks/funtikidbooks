"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  addDirectReaction,
  getConversation,
  getDirectReactionsSince,
  markDirectMessagesRead,
  removeDirectReaction,
  sendDirectMessage,
} from "@/lib/actions/messages";
import { thumbnailUrl } from "@/lib/imageTransform";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { translateMessage } from "@/lib/actions/translate";
import { ImageLightbox } from "@/components/workspace/ImageLightbox";
import type { DirectMessage, DirectMessageReaction, Profile } from "@/lib/types";

// How long the peer's "typing…" indicator stays up after their last
// keystroke broadcast, and the minimum gap between our own outgoing
// typing broadcasts (no point spamming one per keystroke).
const TYPING_IDLE_MS = 3000;
const TYPING_BROADCAST_THROTTLE_MS = 2000;

// Same quick-pick set as the room chat's reaction popover (MeetingHub) —
// kept as its own local copy rather than a shared import since it's just a
// six-item literal, not worth a shared module for.
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];

// A curated set of quick-pick emoji for a small popover — no need to pull
// in a whole emoji-picker dependency for a work chat.
const EMOJI_OPTIONS = [
  "😀", "😂", "😅", "😍", "😉", "😎", "🤔", "😢",
  "😭", "😡", "🥳", "😴", "😱", "🙌", "👀", "🤝",
  "👍", "👎", "👏", "🙏", "💪", "🔥", "✅", "❌",
  "🎉", "❤️", "💯", "😘", "🐶", "🐱",
];

function TypingDots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[12px] italic" style={{ color: "var(--color-neutral-500)" }}>
        {label}
      </span>
      <span className="inline-flex items-center gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="fk-typing-dot"
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--color-neutral-500)",
              display: "inline-block",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </span>
    </span>
  );
}

function formatTime(date: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function isSameCalendarDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// Same Zalo-style date divider as the room chat (MeetingHub) — kept as its
// own local copy rather than a shared import, same reasoning as formatTime
// above.
function formatDateDivider(date: string) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameCalendarDay(date, today.toISOString())) return "Hôm nay";
  if (isSameCalendarDay(date, yesterday.toISOString())) return "Hôm qua";
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function isImage(mime: string | null) {
  return !!mime && mime.startsWith("image/");
}

// Very small "is this a link" check — good enough to auto-linkify a URL a
// member pastes into the chat, without pulling in a URL-parsing library.
function linkify(text: string): (string | { url: string })[] {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part) => (/^https?:\/\//.test(part) ? { url: part } : part));
}

// The message list + composer for a 1:1 conversation — shared by the small
// floating ChatWindow and the full-panel "Riêng" tab in Trò chuyện & họp, so
// fixes/features (typing indicator, reactions-free plain bubbles, paste,
// composer auto-grow...) only need to be written once. Renders two flex
// children (list, composer) and expects the caller to provide a
// `flex flex-col min-h-0`-ish container with a defined height.
export function DirectConversation({
  peer,
  currentUser,
  scrollToMessageId,
  onScrolledTo,
  onCallClick,
}: {
  peer: Profile;
  currentUser: Pick<Profile, "id" | "display_name">;
  scrollToMessageId?: string | null;
  onScrolledTo?: () => void;
  // Renders a phone-icon button in the composer, next to the emoji picker,
  // when provided — the call itself (VideoCallModal, presence banner) is
  // the caller's concern, same as before; this just moves where the button
  // that starts it lives, out of the header and down by the composer.
  onCallClick?: () => void;
}) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [reactions, setReactions] = useState<DirectMessageReaction[]>([]);
  const [text, setText] = useState("");
  // Temp (client-generated) ids currently in flight or that failed — drives
  // the "Đang gửi…" / "Gửi lỗi" footer on an optimistic bubble. See
  // handleSend/attemptSend below for why messages appear instantly instead
  // of waiting on the server round-trip.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const pendingPayloadsRef = useRef<Map<string, { content: string; file: File | null }>>(new Map());
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  // Per-message translate-on-demand — cached by message id so toggling a
  // translation back on doesn't re-hit the (free, unofficial) endpoint.
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [shownTranslationIds, setShownTranslationIds] = useState<Set<string>>(new Set());
  // `${messageId}:${emoji}` of the reaction pill currently hovered — same
  // bigger "who reacted" popover as MeetingHub's, instead of a native title
  // tooltip.
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; filename: string | null } | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // On phone there's no Ctrl+V and no room to spare — the hint text is
  // desktop-only guidance, so mobile gets a blank placeholder instead of a
  // truncated, half-useful version of it.
  const isMobile = useIsMobileViewport();
  // Which peer the bottom-scroll effect below last handled — lets it tell
  // "just switched conversations, always snap to bottom" apart from "same
  // conversation, only snap if already near the bottom" (see that effect).
  const scrolledPeerIdRef = useRef<string | null>(null);
  // Holds a conversation switch "stuck to bottom" past the single triggering
  // render — an attachment image with no reserved height can finish loading
  // a full second or more after the switch, and that onLoad call
  // (force=false) needs to still win during this window instead of only
  // re-snapping when already within 150px, or the view is left sitting
  // above the true bottom.
  const stickyUntilRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Latest messages/reactions arrays, read (not reacted to) from inside
  // resync() below — kept out of its dependency array so a new message or
  // reaction doesn't tear down and recreate the realtime channel
  // subscription every time one arrives.
  const messagesRef = useRef<DirectMessage[]>([]);
  const reactionsRef = useRef<DirectMessageReaction[]>([]);
  // Which peer resync() last actually fetched — lets it tell "just switched
  // conversations, need the full history" apart from "same conversation,
  // only catching up on what was missed".
  const lastSyncedPeerIdRef = useRef<string | null>(null);
  const peerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);

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
    if (!showEmojiPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  useEffect(() => {
    if (!reactionPickerFor) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setReactionPickerFor(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [reactionPickerFor]);

  // Reconciles a server-confirmed row against the optimistic placeholder
  // that's standing in for it. Matches by tempId when the caller knows it
  // (our own send resolving); otherwise (the realtime INSERT echoing our
  // own message back) falls back to matching the oldest still-pending
  // temp bubble with the same content, so the rare case of the realtime
  // event arriving before our own await does doesn't leave a duplicate.
  const mergeServerMessage = useCallback(
    (prev: DirectMessage[], confirmed: DirectMessage, tempId?: string) => {
      if (prev.some((m) => m.id === confirmed.id)) return prev;
      if (tempId) {
        const idx = prev.findIndex((m) => m.id === tempId);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = confirmed;
          return next;
        }
      }
      if (confirmed.sender_id === currentUser.id) {
        const idx = prev.findIndex((m) => m.id.startsWith("temp-") && m.content === confirmed.content);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = confirmed;
          return next;
        }
      }
      return [...prev, confirmed];
    },
    [currentUser.id],
  );

  // Catches up this conversation after the realtime subscription below may
  // have silently missed an INSERT while the websocket was disconnected
  // (phone screen locked, tab backgrounded, a network blip...) — that used
  // to show up to staff as a push notification arriving but the message
  // itself never appearing until a manual reload. Called on mount/peer
  // switch, on tab focus/visibility, and whenever the channel below
  // (re)subscribes.
  //
  // On an actual switch to a different conversation this loads the full
  // (up to 200-message) history same as before. Everywhere else — tab
  // refocus, a reconnect while still looking at the same conversation — it
  // only asks for messages newer than the last one already on screen and
  // appends them, instead of re-fetching and replacing all ~200 every time.
  const resync = useCallback(() => {
    const isNewPeer = lastSyncedPeerIdRef.current !== peer.id;
    lastSyncedPeerIdRef.current = peer.id;

    // Reduce rather than "just read the last element" — a realtime INSERT
    // can append out of arrival order, so the newest created_at isn't
    // guaranteed to be the last item in either array (see MeetingHub's
    // resync for the same reasoning).
    const latestOf = (timestamps: string[]) =>
      timestamps.length === 0 ? undefined : timestamps.reduce((max, t) => (t > max ? t : max));

    const messagesAfter = isNewPeer ? undefined : latestOf(messagesRef.current.map((m) => m.created_at));
    const reactionsAfter = isNewPeer ? undefined : latestOf(reactionsRef.current.map((r) => r.created_at));

    getConversation(peer.id, messagesAfter)
      .then((msgs) => {
        if (isNewPeer) {
          setMessages(msgs);
        } else if (msgs.length > 0) {
          setMessages((prev) => msgs.reduce((acc, m) => mergeServerMessage(acc, m), prev));
        }
      })
      .catch(() => {
        // no live backend yet (e.g. workspace-demo) — chat just starts empty
        if (isNewPeer) setMessages([]);
      });

    getDirectReactionsSince(peer.id, reactionsAfter)
      .then((rx) => {
        if (isNewPeer) {
          setReactions(rx);
        } else if (rx.length > 0) {
          setReactions((prev) => {
            const key = (r: DirectMessageReaction) => `${r.message_id}:${r.profile_id}:${r.emoji}`;
            const seen = new Set(prev.map(key));
            const fresh = rx.filter((r) => !seen.has(key(r)));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      })
      .catch(() => {
        if (isNewPeer) setReactions([]);
      });
  }, [peer.id, mergeServerMessage]);

  useEffect(() => {
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

  // Marks every unread message from the peer as read the moment this
  // conversation is open and has anything to show — mirrors Messenger's
  // behavior of marking things read just by having the thread open. Safe to
  // call redundantly: the update only ever touches rows still unread.
  useEffect(() => {
    if (messages.length === 0) return;
    markDirectMessagesRead(peer.id).catch(() => {});
  }, [peer.id, messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    reactionsRef.current = reactions;
  }, [reactions]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`dm-${[currentUser.id, peer.id].sort().join("-")}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = payload.new as DirectMessage;
          const belongsHere =
            (row.sender_id === currentUser.id && row.recipient_id === peer.id) ||
            (row.sender_id === peer.id && row.recipient_id === currentUser.id);
          if (!belongsHere) return;
          setMessages((prev) => mergeServerMessage(prev, row));
          if (row.sender_id === peer.id) {
            if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
            setPeerTyping(false);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages" },
        (payload) => {
          // Only read_at ever changes on an existing row — this is what
          // makes the "Đã xem" marker below update live once the peer opens
          // the conversation, instead of only after a resync.
          const row = payload.new as DirectMessage;
          const belongsHere =
            (row.sender_id === currentUser.id && row.recipient_id === peer.id) ||
            (row.sender_id === peer.id && row.recipient_id === currentUser.id);
          if (!belongsHere) return;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_message_reactions" },
        (payload) => {
          const row = payload.new as DirectMessageReaction;
          if (!messagesRef.current.some((m) => m.id === row.message_id)) return;
          setReactions((prev) =>
            prev.some((r) => r.message_id === row.message_id && r.profile_id === row.profile_id && r.emoji === row.emoji)
              ? prev
              : [...prev, row],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "direct_message_reactions" },
        (payload) => {
          const old = payload.old as { message_id: string; profile_id: string; emoji: string };
          setReactions((prev) =>
            prev.filter((r) => !(r.message_id === old.message_id && r.profile_id === old.profile_id && r.emoji === old.emoji)),
          );
        },
      )
      .on("broadcast", { event: "typing" }, (msg) => {
        if ((msg.payload as { userId?: string } | null)?.userId !== peer.id) return;
        setPeerTyping(true);
        if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
        peerTypingTimeoutRef.current = setTimeout(() => setPeerTyping(false), TYPING_IDLE_MS);
      })
      // Fires with "SUBSCRIBED" both on the initial connect and after any
      // reconnect — resyncing here is what catches up on messages that
      // arrived during a drop, since Realtime doesn't replay missed events.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") resync();
      });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
      setPeerTyping(false);
      supabase.removeChannel(channel);
    };
  }, [currentUser.id, peer.id, resync, mergeServerMessage]);

  // Shared by the effect below and each message image's onLoad — an
  // attachment thumbnail has no reserved width/height (just a max-size
  // cap), so the browser doesn't know its real height until the image data
  // actually arrives over the network, which can land well after messages/
  // read receipts have already settled. That late layout shift is another
  // way the view can end up sitting short of the true bottom.
  const stickToBottomIfNear = useCallback((force: boolean) => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (force || Date.now() < stickyUntilRef.current || distanceFromBottom < 150) {
      el.scrollTo({ top: el.scrollHeight });
      setShowJumpToBottom(false);
    } else {
      setShowJumpToBottom(distanceFromBottom > 400);
    }
  }, []);

  // Fires on manual scroll — catches the reader scrolling away from the
  // bottom themselves, which the effect-driven stickToBottomIfNear calls
  // (new message/read-receipt updates) don't see since nothing about the
  // data changed.
  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpToBottom(distanceFromBottom > 400);
  }, []);

  // A read-receipt UPDATE (the "Đã xem" label appearing) changes an
  // existing message's read_at in place via .map(), which doesn't change
  // messages.length — so keying only on that left the view sitting just
  // short of the true bottom once "Đã xem" popped in under the last
  // message, looking "stuck halfway" instead of flush against the composer.
  //
  // Re-checks on every relevant update instead: always snaps to bottom
  // right after switching conversations (scrolledPeerIdRef changing), and
  // otherwise only re-snaps if the view was already within a small margin
  // of the bottom — so it doesn't yank someone back down while they're
  // scrolled up reading history.
  useEffect(() => {
    const isPeerSwitch = scrolledPeerIdRef.current !== peer.id;
    if (isPeerSwitch) stickyUntilRef.current = Date.now() + 3000;
    stickToBottomIfNear(isPeerSwitch);
    // Only marks the switch as handled once there's actual content to have
    // scrolled to — see the same guard in MeetingHub's version of this
    // effect for why consuming the flag on an empty first render breaks it.
    if (messages.length > 0) {
      scrolledPeerIdRef.current = peer.id;
    }
    // reactions is included so a pill landing after the initial fetch (see
    // resync()'s two independent requests) re-triggers the same near-bottom
    // check MeetingHub's equivalent effect already does.
  }, [peer.id, messages, reactions, peerTyping, stickToBottomIfNear]);

  // Scrolling to a search hit is a separate concern from the scroll-to-bottom
  // effect above — declared after it so it wins when both would fire off the
  // same `messages` update. The setState that clears the request lives in the
  // parent (onScrolledTo), so this effect itself never calls setState.
  useEffect(() => {
    if (!scrollToMessageId) return;
    const el = document.getElementById(`dm-msg-${scrollToMessageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("fk-flash-highlight");
    const flashTimer = setTimeout(() => el.classList.remove("fk-flash-highlight"), 1600);
    onScrolledTo?.();
    return () => clearTimeout(flashTimer);
  }, [messages, scrollToMessageId, onScrolledTo]);

  // Grows the composer with the message instead of scrolling the text
  // sideways in a single line.
  useEffect(() => {
    const el = textInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentAtRef.current < TYPING_BROADCAST_THROTTLE_MS) return;
    lastTypingSentAtRef.current = now;
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: currentUser.id } });
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
      if (already) await removeDirectReaction(messageId, emoji);
      else await addDirectReaction(messageId, emoji);
    } catch {
      // optimistic update may drift from the server on failure — next
      // resync or a realtime event from another tab will correct it
    }
  }

  // Free unofficial Google endpoint (see translate.ts) rather than dumping
  // the whole conversation through a translator — only when actually
  // needed for a specific message.
  async function toggleTranslate(message: DirectMessage) {
    if (shownTranslationIds.has(message.id)) {
      setShownTranslationIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
      return;
    }
    if (translations[message.id] !== undefined) {
      setShownTranslationIds((prev) => new Set(prev).add(message.id));
      return;
    }
    setTranslatingIds((prev) => new Set(prev).add(message.id));
    try {
      const { translated } = await translateMessage(message.content);
      setTranslations((prev) => ({ ...prev, [message.id]: translated }));
      setShownTranslationIds((prev) => new Set(prev).add(message.id));
    } catch {
      alert("Không thể dịch lúc này, thử lại sau.");
    } finally {
      setTranslatingIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
    }
  }

  // Lets a screenshot copied to the clipboard (or any image) go straight
  // into the composer with Ctrl+V, same as the room chat's composer —
  // checks clipboardData.files first (the simplest, most broadly-supported
  // path) and only falls back to walking clipboardData.items — which some
  // screenshot tools use instead — if that comes up empty.
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

  const attemptSend = useCallback(
    async (tempId: string, content: string, file: File | null) => {
      setFailedIds((prev) => {
        if (!prev.has(tempId)) return prev;
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
      setPendingIds((prev) => new Set(prev).add(tempId));
      try {
        let formData: FormData | undefined;
        if (file) {
          formData = new FormData();
          formData.append("file", file);
        }
        const sent = await sendDirectMessage(peer.id, content, formData);
        if (sent) {
          setMessages((prev) => mergeServerMessage(prev, sent, tempId));
          pendingPayloadsRef.current.delete(tempId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không thể gửi tin nhắn. Vui lòng thử lại.");
        setFailedIds((prev) => new Set(prev).add(tempId));
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
      }
    },
    [peer.id, mergeServerMessage],
  );

  // Appears instantly instead of waiting on the send round-trip — matches
  // how Zalo/Messenger feel, versus the message only showing up once the
  // server confirms it. Failed sends stay in the list (tagged in
  // failedIds) with a retry affordance rather than dumping the text back
  // into the composer.
  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    const file = pendingFile;
    if (!trimmed && !file) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: DirectMessage = {
      id: tempId,
      sender_id: currentUser.id,
      recipient_id: peer.id,
      content: trimmed,
      attachment_url: null,
      attachment_filename: file?.name ?? null,
      attachment_mime: file?.type ?? null,
      attachment_size: file?.size ?? null,
      created_at: new Date().toISOString(),
      read_at: null,
    };

    setError(null);
    setText("");
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    pendingPayloadsRef.current.set(tempId, { content: trimmed, file });
    setMessages((prev) => [...prev, optimistic]);
    attemptSend(tempId, trimmed, file);
  }

  function retrySend(tempId: string) {
    const payload = pendingPayloadsRef.current.get(tempId);
    if (!payload) return;
    attemptSend(tempId, payload.content, payload.file);
  }

  // Messenger-style: only the LAST of my messages the peer has actually
  // seen gets the "Đã xem" label, not every read message — walk from the
  // end since that's the most recent qualifying one.
  const lastSeenMineMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sender_id === currentUser.id && m.read_at) return m.id;
    }
    return null;
  }, [messages, currentUser.id]);

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0" style={{ position: "relative" }}>
      <div
        ref={listRef}
        onScroll={handleListScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col p-3"
        style={{ touchAction: "pan-y" }}
      >
        {messages.length === 0 && (
          <p className="text-[12px] text-center mt-4" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có tin nhắn nào.
          </p>
        )}
        {messages.map((m, index) => {
          const mine = m.sender_id === currentUser.id;
          const isPending = pendingIds.has(m.id);
          const isFailed = failedIds.has(m.id);
          // Same Zalo/Messenger-style grouping as the room chats (MeetingHub):
          // consecutive messages from the same person within a few minutes
          // sit tight together, with only the last one in the run showing a
          // timestamp, instead of every single message getting its own gap.
          const prev = index > 0 ? messages[index - 1] : null;
          const next = index < messages.length - 1 ? messages[index + 1] : null;
          const isNewDay = !prev || !isSameCalendarDay(m.created_at, prev.created_at);
          const isGroupStart =
            !prev ||
            isNewDay ||
            prev.sender_id !== m.sender_id ||
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
          const isGroupEnd =
            !next ||
            next.sender_id !== m.sender_id ||
            new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > 5 * 60 * 1000;
          const msgReactions = reactions.filter((r) => r.message_id === m.id);
          const grouped = msgReactions.reduce<Record<string, string[]>>((acc, r) => {
            (acc[r.emoji] ??= []).push(r.profile_id);
            return acc;
          }, {});
          const translateButton = m.content && (
            <button
              type="button"
              onClick={() => toggleTranslate(m)}
              disabled={translatingIds.has(m.id)}
              className="fk-msg-actions btn-icon opacity-0 group-hover:opacity-100 transition-opacity flex-none"
              style={{ width: 20, height: 20, padding: 0, fontSize: 11 }}
              aria-label="Dịch tin nhắn"
              title="Dịch Anh ⇄ Việt"
            >
              {translatingIds.has(m.id) ? "…" : "🌐"}
            </button>
          );
          const reactionButton = (
            <span className="relative inline-flex flex-none">
              <button
                type="button"
                onClick={() => setReactionPickerFor(reactionPickerFor === m.id ? null : m.id)}
                className="fk-msg-actions btn-icon opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ width: 20, height: 20, padding: 0, fontSize: 11 }}
                aria-label="Thả cảm xúc"
              >
                😊
              </button>
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
            </span>
          );
          return (
            <Fragment key={m.id}>
              {isNewDay && (
                <div className="flex items-center justify-center my-3">
                  <span
                    className="text-[11px] font-semibold px-3 py-1 rounded-full"
                    style={{ background: "var(--color-surface)", color: "var(--color-neutral-500)" }}
                  >
                    {formatDateDivider(m.created_at)}
                  </span>
                </div>
              )}
              <div
              id={`dm-msg-${m.id}`}
              // items-end/items-start only aligns THIS wrapper's own children
              // — inside the outer flex-col message list (align-items:
              // stretch by default), the wrapper itself still anchors to the
              // left and just gets capped at 82% width, leaving the missing
              // 18% as a gap on the right instead of at the true edge for
              // "mine" messages. self-end/self-start positions the wrapper
              // itself within that list.
              className={`group flex flex-col min-w-0 ${mine ? "items-end self-end" : "items-start self-start"} max-w-[82%]`}
              style={{ marginTop: isGroupStart ? 12 : 2, opacity: isPending ? 0.6 : 1 }}
            >
              {m.content && (
                <div className={`flex items-end gap-1 min-w-0 max-w-full ${mine ? "flex-row-reverse" : ""}`}>
                  <div
                    className="min-w-0 rounded-[12px] px-3 py-1.5 text-[17px] whitespace-pre-wrap break-words"
                    style={{
                      background: isFailed ? "var(--status-red-100, #fde2e2)" : mine ? "var(--color-accent-500)" : "var(--color-surface)",
                      color: isFailed ? "var(--status-red, #c22)" : mine ? "#fff" : "var(--color-text)",
                    }}
                  >
                    {linkify(m.content).map((part, i) =>
                      typeof part === "string" ? (
                        part
                      ) : (
                        <span key={i} className="inline-flex items-center gap-0.5">
                          <a
                            href={part.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: mine ? "#fff" : "var(--color-accent-700)", textDecoration: "underline" }}
                          >
                            {part.url}
                          </a>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              navigator.clipboard?.writeText(part.url).catch(() => {});
                            }}
                            aria-label="Sao chép link"
                            title="Sao chép link"
                            style={{ fontSize: 11, opacity: mine ? 0.85 : 0.6, lineHeight: 1 }}
                          >
                            📋
                          </button>
                        </span>
                      ),
                    )}
                    {shownTranslationIds.has(m.id) && (
                      <div
                        className="mt-1.5 pt-1.5 text-[15px]"
                        style={{
                          borderTop: `1px solid ${mine ? "rgba(255,255,255,.3)" : "var(--color-neutral-200)"}`,
                          opacity: 0.9,
                        }}
                      >
                        <span
                          className="text-[10px] font-bold block mb-0.5"
                          style={{ opacity: 0.7, letterSpacing: "0.03em" }}
                        >
                          🌐 ĐÃ DỊCH
                        </span>
                        {translations[m.id] || "(không có nội dung)"}
                      </div>
                    )}
                  </div>
                  {translateButton}
                  {reactionButton}
                </div>
              )}
              {m.attachment_url &&
                (isImage(m.attachment_mime) ? (
                  <div className={`flex items-end gap-1 mt-1 ${mine ? "flex-row-reverse" : ""}`}>
                    <button
                      type="button"
                      onClick={() => setLightbox({ url: m.attachment_url!, filename: m.attachment_filename })}
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnailUrl(m.attachment_url, 480)}
                        alt={m.attachment_filename ?? ""}
                        className="rounded-[10px] object-cover"
                        style={{ maxWidth: 340, maxHeight: 340 }}
                        onLoad={() => stickToBottomIfNear(false)}
                      />
                    </button>
                    {!m.content && reactionButton}
                  </div>
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
              {!m.attachment_url && m.attachment_filename && (
                <div
                  className="mt-1 flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold"
                  style={{ background: "var(--color-surface)", color: "var(--color-neutral-500)" }}
                >
                  📎 {m.attachment_filename} {isFailed ? "— chưa gửi được" : "— đang gửi…"}
                </div>
              )}
              {Object.keys(grouped).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(grouped).map(([emoji, ids]) => {
                    const reactedByMe = ids.includes(currentUser.id);
                    const reactionKey = `${m.id}:${emoji}`;
                    // Only two people can ever be in this conversation, so
                    // there's no need for a profile lookup — just tell the
                    // two apart directly.
                    const names = ids.map((id) => (id === currentUser.id ? "Bạn" : peer.display_name));
                    return (
                      <span key={emoji} className="relative inline-block">
                        <button
                          type="button"
                          onClick={() => toggleReaction(m.id, emoji)}
                          onMouseEnter={() => setHoveredReaction(reactionKey)}
                          onMouseLeave={() => setHoveredReaction((prev) => (prev === reactionKey ? null : prev))}
                          className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                          style={{
                            background: reactedByMe ? "var(--color-accent-100)" : "var(--color-surface)",
                            border: `1px solid ${reactedByMe ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                          }}
                        >
                          <span aria-hidden>{emoji}</span>
                          {ids.length}
                        </button>
                        {hoveredReaction === reactionKey && (
                          <span
                            className="absolute z-10 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap"
                            style={{
                              bottom: "calc(100% + 6px)",
                              left: "50%",
                              transform: "translateX(-50%)",
                              background: "var(--color-neutral-900, #1a1a1a)",
                              color: "#fff",
                              boxShadow: "var(--shadow-md, 0 2px 8px rgba(0,0,0,.25))",
                            }}
                          >
                            {emoji} {names.join(", ")}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
              {isFailed ? (
                <button
                  type="button"
                  onClick={() => retrySend(m.id)}
                  className="text-[11px] font-semibold mt-0.5"
                  style={{ color: "var(--status-red, #c22)" }}
                >
                  ⚠️ Gửi lỗi — Bấm để gửi lại
                </button>
              ) : isPending ? (
                <span className="text-[10px] mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
                  Đang gửi…
                </span>
              ) : (
                isGroupEnd && (
                  <span className="text-[10px] mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
                    {formatTime(m.created_at)}
                  </span>
                )
              )}
              {m.id === lastSeenMineMessageId && (
                <span className="flex items-center gap-1 mt-0.5" title={`${peer.display_name} đã xem`}>
                  <span
                    className="flex items-center justify-center rounded-full text-[8px] font-bold overflow-hidden flex-none"
                    style={{ width: 12, height: 12, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                  >
                    {peer.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbnailUrl(peer.avatar_url, 24)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      peer.display_name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--color-neutral-500)" }}>
                    Đã xem
                  </span>
                </span>
              )}
            </div>
            </Fragment>
          );
        })}
        {peerTyping && (
          <div className="flex items-center gap-1.5">
            <div
              className="rounded-[12px] px-3 py-2"
              style={{ background: "var(--color-surface)" }}
              aria-label={`${peer.display_name} đang gõ…`}
            >
              <TypingDots label="Đang gõ" />
            </div>
          </div>
        )}
      </div>
      {showJumpToBottom && (
        <button
          type="button"
          onClick={() => stickToBottomIfNear(true)}
          className="flex items-center justify-center rounded-full elev-lg"
          style={{
            position: "absolute",
            left: 16,
            bottom: 12,
            width: 36,
            height: 36,
            background: "var(--color-accent-500)",
            color: "#fff",
            fontSize: 16,
            zIndex: 15,
          }}
          aria-label="Xuống tin nhắn mới nhất"
          title="Xuống tin nhắn mới nhất"
        >
          ↓
        </button>
      )}
      </div>

      <div className="flex-none" style={{ borderTop: "1px solid var(--color-neutral-200)", position: "relative" }}>
        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            className="card elev-lg"
            style={{
              position: "absolute",
              bottom: "100%",
              left: 8,
              marginBottom: 6,
              width: 216,
              padding: 8,
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
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
        {error && (
          <p className="text-[11px] font-semibold px-2.5 pt-1.5" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
        {pendingFile && (
          <div className="flex items-center gap-1.5 px-2.5 pt-1.5">
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
                className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[11px] font-semibold truncate max-w-full"
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
              style={{ width: 20, height: 20, padding: 0, fontSize: 11 }}
              aria-label="Bỏ tệp đính kèm"
            >
              ✕
            </button>
          </div>
        )}
        <form ref={composerFormRef} onSubmit={handleSend} className="flex items-end gap-1.5 p-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-icon flex-none"
            style={{ width: 34, height: 34, padding: 0, fontSize: 18 }}
            aria-label="Gửi ảnh hoặc tệp"
          >
            📎
          </button>
          <button
            type="button"
            onClick={() => setShowEmojiPicker((v) => !v)}
            className="btn-icon flex-none"
            style={{ width: 34, height: 34, padding: 0, fontSize: 18 }}
            aria-label="Chọn biểu tượng cảm xúc"
          >
            😀
          </button>
          {onCallClick && (
            <button
              type="button"
              onClick={onCallClick}
              className="btn-icon flex-none"
              style={{ width: 34, height: 34, padding: 0, fontSize: 16 }}
              aria-label="Gọi video"
              title="Gọi video"
            >
              📞
            </button>
          )}
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
            style={{ maxHeight: 140, overflowY: "auto" }}
            rows={1}
            placeholder={isMobile ? "" : "Nhắn tin… (dán ảnh bằng Ctrl+V)"}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) notifyTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                composerFormRef.current?.requestSubmit();
              }
            }}
            onPaste={handlePaste}
          />
          <button type="submit" className="btn btn-primary btn-sm flex-none" style={{ padding: "6px 12px" }}>
            Gửi
          </button>
        </form>
      </div>
      {lightbox && (
        <ImageLightbox url={lightbox.url} filename={lightbox.filename} onClose={() => setLightbox(null)} />
      )}
    </>
  );
}
