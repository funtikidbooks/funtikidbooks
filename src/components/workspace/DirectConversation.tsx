"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getConversation, markDirectMessagesRead, sendDirectMessage } from "@/lib/actions/messages";
import { thumbnailUrl } from "@/lib/imageTransform";
import type { DirectMessage, Profile } from "@/lib/types";

// How long the peer's "typing…" indicator stays up after their last
// keystroke broadcast, and the minimum gap between our own outgoing
// typing broadcasts (no point spamming one per keystroke).
const TYPING_IDLE_MS = 3000;
const TYPING_BROADCAST_THROTTLE_MS = 2000;

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
}: {
  peer: Profile;
  currentUser: Pick<Profile, "id" | "display_name">;
  scrollToMessageId?: string | null;
  onScrolledTo?: () => void;
}) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Which peer the bottom-scroll effect below last handled — lets it tell
  // "just switched conversations, always snap to bottom" apart from "same
  // conversation, only snap if already near the bottom" (see that effect).
  const scrolledPeerIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Latest messages array, read (not reacted to) from inside resync() below
  // — kept out of its dependency array so a new message doesn't tear down
  // and recreate the realtime channel subscription every time one arrives.
  const messagesRef = useRef<DirectMessage[]>([]);
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
    const after =
      !isNewPeer && messagesRef.current.length > 0
        ? messagesRef.current[messagesRef.current.length - 1].created_at
        : undefined;

    getConversation(peer.id, after)
      .then((msgs) => {
        if (isNewPeer) {
          setMessages(msgs);
        } else if (msgs.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = msgs.filter((m) => !seen.has(m.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      })
      .catch(() => {
        // no live backend yet (e.g. workspace-demo) — chat just starts empty
        if (isNewPeer) setMessages([]);
      });
  }, [peer.id]);

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
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
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
  }, [currentUser.id, peer.id, resync]);

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
    if (force || distanceFromBottom < 150) {
      el.scrollTo({ top: el.scrollHeight });
    }
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
    stickToBottomIfNear(isPeerSwitch);
    // Only marks the switch as handled once there's actual content to have
    // scrolled to — see the same guard in MeetingHub's version of this
    // effect for why consuming the flag on an empty first render breaks it.
    if (messages.length > 0) {
      scrolledPeerIdRef.current = peer.id;
    }
  }, [peer.id, messages, peerTyping, stickToBottomIfNear]);

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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    const file = pendingFile;
    if (!trimmed && !file) return;
    setSending(true);
    setError(null);
    setText("");
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      let formData: FormData | undefined;
      if (file) {
        formData = new FormData();
        formData.append("file", file);
      }
      const sent = await sendDirectMessage(peer.id, trimmed, formData);
      if (sent) setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể gửi tin nhắn. Vui lòng thử lại.");
      setText(trimmed);
      setPendingFile(file ?? null);
    } finally {
      setSending(false);
    }
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
      <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col p-3">
        {messages.length === 0 && (
          <p className="text-[12px] text-center mt-4" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có tin nhắn nào.
          </p>
        )}
        {messages.map((m, index) => {
          const mine = m.sender_id === currentUser.id;
          // Same Zalo/Messenger-style grouping as the room chats (MeetingHub):
          // consecutive messages from the same person within a few minutes
          // sit tight together, with only the last one in the run showing a
          // timestamp, instead of every single message getting its own gap.
          const prev = index > 0 ? messages[index - 1] : null;
          const next = index < messages.length - 1 ? messages[index + 1] : null;
          const isGroupStart =
            !prev ||
            prev.sender_id !== m.sender_id ||
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
          const isGroupEnd =
            !next ||
            next.sender_id !== m.sender_id ||
            new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > 5 * 60 * 1000;
          return (
            <div
              id={`dm-msg-${m.id}`}
              key={m.id}
              className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
              style={{ marginTop: isGroupStart ? 12 : 2 }}
            >
              {m.content && (
                <div
                  className="rounded-[12px] px-3 py-1.5 text-[17px] max-w-[70%] whitespace-pre-wrap break-words"
                  style={{
                    background: mine ? "var(--color-accent-500)" : "var(--color-surface)",
                    color: mine ? "#fff" : "var(--color-text)",
                  }}
                >
                  {linkify(m.content).map((part, i) =>
                    typeof part === "string" ? (
                      part
                    ) : (
                      <a
                        key={i}
                        href={part.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: mine ? "#fff" : "var(--color-accent-700)", textDecoration: "underline" }}
                      >
                        {part.url}
                      </a>
                    ),
                  )}
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
                      onLoad={() => stickToBottomIfNear(false)}
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
              {isGroupEnd && (
                <span className="text-[10px] mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
                  {formatTime(m.created_at)}
                </span>
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
            style={{ width: 30, height: 30, padding: 0 }}
            aria-label="Gửi ảnh hoặc tệp"
          >
            📎
          </button>
          <button
            type="button"
            onClick={() => setShowEmojiPicker((v) => !v)}
            className="btn-icon flex-none"
            style={{ width: 30, height: 30, padding: 0 }}
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
            style={{ padding: "6px 10px", fontSize: 13, maxHeight: 140, overflowY: "auto" }}
            rows={1}
            placeholder="Nhắn tin… (dán ảnh bằng Ctrl+V)"
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
          <button type="submit" disabled={sending} className="btn btn-primary btn-sm flex-none" style={{ padding: "6px 12px" }}>
            Gửi
          </button>
        </form>
      </div>
    </>
  );
}
