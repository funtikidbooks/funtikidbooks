"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getConversation, sendDirectMessage } from "@/lib/actions/messages";
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
  "🎉", "❤️", "💯", "😘",
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

export function ChatWindow({
  peer,
  currentUser,
  onClose,
  offsetRight,
}: {
  peer: Profile;
  currentUser: Pick<Profile, "id" | "display_name">;
  onClose: () => void;
  offsetRight: number;
}) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const peerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

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
    let cancelled = false;
    getConversation(peer.id)
      .then((msgs) => !cancelled && setMessages(msgs))
      .catch(() => {
        // no live backend yet (e.g. workspace-demo) — chat just starts empty
      });
    return () => {
      cancelled = true;
    };
  }, [peer.id]);

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
      .on("broadcast", { event: "typing" }, (msg) => {
        if ((msg.payload as { userId?: string } | null)?.userId !== peer.id) return;
        setPeerTyping(true);
        if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
        peerTypingTimeoutRef.current = setTimeout(() => setPeerTyping(false), TYPING_IDLE_MS);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
      setPeerTyping(false);
      supabase.removeChannel(channel);
    };
  }, [currentUser.id, peer.id]);

  useEffect(() => {
    if (!minimized) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, minimized, peerTyping]);

  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentAtRef.current < TYPING_BROADCAST_THROTTLE_MS) return;
    lastTypingSentAtRef.current = now;
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: currentUser.id } });
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

  return (
    <div
      className="card elev-lg fixed flex flex-col z-40"
      style={{ right: offsetRight, bottom: 0, width: 280, height: minimized ? "auto" : 380 }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer flex-none"
        style={{ borderBottom: minimized ? "none" : "1px solid var(--color-neutral-200)" }}
        onClick={() => setMinimized((v) => !v)}
      >
        <span
          className="flex items-center justify-center rounded-full font-bold flex-none overflow-hidden"
          style={{ width: 26, height: 26, fontSize: 11, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
        >
          {peer.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            peer.display_name.charAt(0).toUpperCase()
          )}
        </span>
        <span className="text-[13px] font-bold flex-1 truncate">{peer.display_name}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="btn-icon flex-none"
          aria-label="Đóng"
          style={{ width: 26, height: 26, padding: 0 }}
        >
          ✕
        </button>
      </div>

      {!minimized && (
        <>
          <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col gap-2 p-2.5">
            {messages.length === 0 && (
              <p className="text-[12px] text-center mt-4" style={{ color: "var(--color-neutral-500)" }}>
                Chưa có tin nhắn nào.
              </p>
            )}
            {messages.map((m) => {
              const mine = m.sender_id === currentUser.id;
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {m.content && (
                    <div
                      className="rounded-[12px] px-3 py-1.5 text-[13px] max-w-[85%] whitespace-pre-wrap break-words"
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
                          src={m.attachment_url}
                          alt={m.attachment_filename ?? ""}
                          className="rounded-[10px] object-cover"
                          style={{ maxWidth: 180, maxHeight: 180 }}
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
                  <span className="text-[10px] mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
                    {formatTime(m.created_at)}
                  </span>
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
                <span
                  className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[11px] font-semibold truncate max-w-full"
                  style={{ background: "var(--color-surface)", color: "var(--color-accent-700)" }}
                >
                  {isImage(pendingFile.type) ? "🖼" : "📄"} {pendingFile.name}
                </span>
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
            <form onSubmit={handleSend} className="flex items-center gap-1.5 p-2">
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
              <input
                ref={textInputRef}
                className="input flex-1"
                style={{ padding: "6px 10px", fontSize: 13 }}
                placeholder="Nhắn tin…"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (e.target.value.trim()) notifyTyping();
                }}
              />
              <button type="submit" disabled={sending} className="btn btn-primary btn-sm flex-none" style={{ padding: "6px 12px" }}>
                Gửi
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
