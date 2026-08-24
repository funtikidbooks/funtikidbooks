"use client";

import { useEffect, useRef, useState } from "react";
import { startVisitorConversation, sendVisitorMessage, getVisitorMessages } from "@/lib/actions/visitor-chat";
import type { VisitorMessage } from "@/lib/types";

const STORAGE_ID_KEY = "funti-visitor-conversation-id";
const STORAGE_TOKEN_KEY = "funti-visitor-token";
const POLL_MS = 4000;

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function SupportChatWidget() {
  const [open, setOpen] = useState(false);
  // Safe to read localStorage in the initializer (not an effect): this
  // state only ever affects markup inside `{open && ...}`, and `open`
  // itself starts false and is only ever flipped true by a click, so the
  // server-rendered and first-client-rendered HTML are identical either way.
  const [conversationId, setConversationId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(STORAGE_ID_KEY),
  );
  const [token, setToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(STORAGE_TOKEN_KEY),
  );
  const [messages, setMessages] = useState<VisitorMessage[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !conversationId || !token) return;

    let cancelled = false;
    async function poll() {
      try {
        const msgs = await getVisitorMessages(conversationId!, token!);
        if (!cancelled) setMessages(msgs);
      } catch {
        // transient network hiccup — next poll will retry
      }
    }
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, conversationId, token]);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, open]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);

    try {
      if (!conversationId || !token) {
        const result = await startVisitorConversation(name, trimmed);
        localStorage.setItem(STORAGE_ID_KEY, result.conversationId);
        localStorage.setItem(STORAGE_TOKEN_KEY, result.token);
        setConversationId(result.conversationId);
        setToken(result.token);
        setMessages([result.message]);
      } else {
        const sent = await sendVisitorMessage(conversationId, token, trimmed);
        setMessages((prev) => [...prev, sent]);
      }
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể gửi tin nhắn. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat với Funti Kidbooks"
        title="Chat với chúng tôi"
        className="fixed z-50 flex items-center justify-center rounded-full"
        style={{ width: 56, height: 56, right: 20, bottom: 20, background: "var(--color-accent-500)", boxShadow: "var(--shadow-lg)" }}
      >
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 12, letterSpacing: "-0.02em" }}>{open ? "Đóng" : "Hỗ trợ"}</span>
      </button>

      {open && (
        // Opens beside the button (not above it) so it doesn't cover the
        // Zalo/Messenger buttons stacked directly above.
        <div
          className="card elev-lg fixed flex flex-col z-50"
          style={{ right: 84, bottom: 20, width: 280, height: 380 }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2.5 flex-none"
            style={{ borderBottom: "1px solid var(--color-neutral-200)", background: "var(--color-accent-500)", borderRadius: "var(--radius-md) var(--radius-md) 0 0" }}
          >
            <span className="text-[13px] font-bold flex-1" style={{ color: "#fff" }}>
              Chat với Funti Kidbooks
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Đóng"
              className="flex items-center justify-center rounded-full"
              style={{ width: 22, height: 22, color: "#fff" }}
            >
              ✕
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col gap-2 p-2.5">
            {messages.length === 0 && (
              <p className="text-[12px] text-center mt-4" style={{ color: "var(--color-neutral-500)" }}>
                Để lại lời nhắn, đội ngũ Funti Kidbooks sẽ phản hồi sớm nhất có thể 💌
              </p>
            )}
            {messages.map((m) => {
              const mine = m.sender_type === "visitor";
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <div
                    className="rounded-[12px] px-3 py-1.5 text-[13px] max-w-[85%] whitespace-pre-wrap break-words"
                    style={{
                      background: mine ? "var(--color-accent-500)" : "var(--color-surface)",
                      color: mine ? "#fff" : "var(--color-text)",
                    }}
                  >
                    {m.content}
                  </div>
                  <span className="text-[10px] mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
                    {formatTime(m.created_at)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex-none" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
            {error && (
              <p className="text-[11px] font-semibold px-2.5 pt-1.5" style={{ color: "var(--status-red)" }}>
                {error}
              </p>
            )}
            {!conversationId && (
              <input
                className="input"
                style={{ margin: "8px 8px 0", width: "calc(100% - 16px)", padding: "6px 10px", fontSize: 13 }}
                placeholder="Tên của bạn (không bắt buộc)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <form onSubmit={handleSend} className="flex items-center gap-1.5 p-2">
              <input
                className="input flex-1"
                style={{ padding: "6px 10px", fontSize: 13 }}
                placeholder="Nhắn tin…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button type="submit" disabled={sending || !text.trim()} className="btn btn-primary btn-sm flex-none" style={{ padding: "6px 12px" }}>
                Gửi
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
