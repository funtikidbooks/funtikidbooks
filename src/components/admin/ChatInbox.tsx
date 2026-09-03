"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  closeVisitorConversation,
  getVisitorConversationMessages,
  markVisitorConversationRead,
  sendStaffReply,
} from "@/lib/actions/support-chat";
import type { VisitorConversation, VisitorMessage } from "@/lib/types";

// Explicit timeZone — without it this reads the server's own timezone
// (UTC on Vercel) instead of Vietnam's, a real hydration-mismatch source;
// see MeetingHub.tsx's own comment on the same fix.
function formatTime(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

function labelFor(c: VisitorConversation) {
  return c.visitor_name?.trim() || `Khách #${c.id.slice(0, 4)}`;
}

export function ChatInbox({ initialConversations }: { initialConversations: VisitorConversation[] }) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<VisitorMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);

  // The realtime subscription below is set up once (empty deps) so it
  // doesn't reconnect every time the selected conversation changes — it
  // reads the current selection through this ref instead of a stale closure.
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    getVisitorConversationMessages(activeId).then((msgs) => !cancelled && setMessages(msgs));
    markVisitorConversationRead(activeId).then(() => {
      if (!cancelled) setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, unread: false } : c)));
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("visitor-messages-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visitor_messages" }, (payload) => {
        const row = payload.new as VisitorMessage;
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === row.conversation_id);
          if (!exists) return prev;
          return prev
            .map((c) =>
              c.id === row.conversation_id
                ? { ...c, last_message_at: row.created_at, unread: row.sender_type === "visitor" }
                : c,
            )
            .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
        });
        setMessages((prev) => {
          if (row.conversation_id !== activeIdRef.current) return prev;
          return prev.some((m) => m.id === row.id) ? prev : [...prev, row];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendStaffReply(active.id, text.trim());
      setMessages((prev) => [...prev, sent]);
      setConversations((prev) =>
        prev.map((c) => (c.id === active.id ? { ...c, last_message_at: sent.created_at, unread: false } : c)),
      );
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSending(false);
    }
  }

  async function handleClose() {
    if (!active) return;
    if (!confirm(`Đóng cuộc trò chuyện với ${labelFor(active)}?`)) return;
    await closeVisitorConversation(active.id);
    setConversations((prev) => prev.map((c) => (c.id === active.id ? { ...c, status: "closed" } : c)));
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-[280px] flex-none overflow-y-auto" style={{ borderRight: "1px solid var(--color-neutral-200)" }}>
        {conversations.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có khách nào chat.
          </p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className="w-full flex items-center gap-2 px-3 py-3 text-left"
              style={{
                background: c.id === activeId ? "var(--color-accent-100)" : undefined,
                borderBottom: "1px solid var(--color-neutral-200)",
                opacity: c.status === "closed" ? 0.55 : 1,
              }}
            >
              <span
                className="flex items-center justify-center rounded-full text-xs font-bold flex-none"
                style={{ width: 32, height: 32, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
              >
                {labelFor(c).charAt(0).toUpperCase()}
              </span>
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-[13px] font-bold truncate" style={{ fontWeight: c.unread ? 800 : 700 }}>
                  {labelFor(c)}
                </span>
                <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                  {formatTime(c.last_message_at)}
                </span>
              </span>
              {c.unread && (
                <span className="rounded-full flex-none" style={{ width: 9, height: 9, background: "var(--status-red)" }} />
              )}
            </button>
          ))
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Chọn một cuộc trò chuyện để xem
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
              <span className="font-bold text-sm">{labelFor(active)}</span>
              {active.status === "open" && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleClose}>
                  Đóng trò chuyện
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-2 p-4">
              {messages.map((m) => {
                const fromVisitor = m.sender_type === "visitor";
                return (
                  <div key={m.id} className={`flex flex-col ${fromVisitor ? "items-start" : "items-end"}`}>
                    <div
                      className="rounded-[12px] px-3 py-1.5 text-[13px] max-w-[70%] whitespace-pre-wrap break-words"
                      style={{
                        background: fromVisitor ? "var(--color-surface)" : "var(--color-accent-500)",
                        color: fromVisitor ? "var(--color-text)" : "#fff",
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

            <div className="flex-none p-3" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
              {error && (
                <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--status-red)" }}>
                  {error}
                </p>
              )}
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  placeholder="Trả lời khách…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={active.status === "closed"}
                />
                <button type="submit" disabled={sending || !text.trim() || active.status === "closed"} className="btn btn-primary btn-sm flex-none">
                  Gửi
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
