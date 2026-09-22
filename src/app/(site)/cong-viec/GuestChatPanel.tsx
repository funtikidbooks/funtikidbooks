"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startVisitorConversation, sendVisitorMessage, getVisitorMessages } from "@/lib/actions/visitor-chat";
import { useDict } from "@/components/site/LocaleProvider";
import type { VisitorMessage } from "@/lib/types";

// Same localStorage keys as the floating "Chat với chúng tôi" widget
// (SupportChatWidget.tsx) — a visitor who chats here and later clicks the
// floating bubble elsewhere on the site (or vice versa) lands in the same
// thread, and claimVisitorConversation() (lib/actions/clientPortal.ts)
// reads these same keys once they sign in below.
export const GUEST_CHAT_ID_KEY = "funti-visitor-conversation-id";
export const GUEST_CHAT_TOKEN_KEY = "funti-visitor-token";
const POLL_MS = 4000;

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// Two-column, Upwork-Messages-style layout for the signed-out state of Work
// With Funti — a narrow left rail (here repurposed from Upwork's
// conversation list into a "your info / sign in" panel, since there's only
// ever one thread: this visitor's) beside one wide chat column that fills
// the rest of the card (no third/right panel — sếp Phúc: "anh sẽ làm sau
// nếu có idea"). A visitor can start typing immediately, no form first —
// every message lands straight in visitor_messages, which staff already
// watch live in /workspace/khach-hang (see ClientProjectsInbox.tsx), same
// as the floating widget. On mobile the two columns stack, chat first
// (order-1), info/sign-in panel below (order-2) — chatting stays the thing
// a visitor can do with zero friction on any screen size.
export function GuestChatPanel({ onSent, onError }: { onSent: () => void; onError: (msg: string | null) => void }) {
  const { t } = useDict();
  const [conversationId, setConversationId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(GUEST_CHAT_ID_KEY),
  );
  const [token, setToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(GUEST_CHAT_TOKEN_KEY),
  );
  const [messages, setMessages] = useState<VisitorMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId || !token) return;
    let cancelled = false;
    async function poll() {
      try {
        const msgs = await getVisitorMessages(conversationId!, token!);
        if (!cancelled) setMessages(msgs);
      } catch {
        // transient network hiccup — next poll retries
      }
    }
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId, token]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setChatError(null);
    try {
      if (!conversationId || !token) {
        const result = await startVisitorConversation(undefined, undefined, trimmed);
        localStorage.setItem(GUEST_CHAT_ID_KEY, result.conversationId);
        localStorage.setItem(GUEST_CHAT_TOKEN_KEY, result.token);
        setConversationId(result.conversationId);
        setToken(result.token);
        setMessages([result.message]);
      } else {
        const sent = await sendVisitorMessage(conversationId, token, trimmed);
        setMessages((prev) => [...prev, sent]);
      }
      setText("");
    } catch (err) {
      setChatError(err instanceof Error ? err.message : t.portal.guestChatSendError);
    } finally {
      setSending(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loggingIn) return;
    setLoggingIn(true);
    onError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        // signup_source lets handle_new_user() (supabase/schema.sql) skip
        // creating a staff `profiles` row for a client sign-in.
        options: { emailRedirectTo: `${window.location.origin}/cong-viec`, data: { signup_source: "client" } },
      });
      if (error) throw error;
      onSent();
    } catch {
      onError(t.portal.sendLinkError);
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <div className="card elev-lg flex flex-col sm:flex-row w-full" style={{ height: 560 }}>
      {/* Chat column — first in DOM so it's first on mobile too */}
      <div className="flex-1 flex flex-col min-h-0 order-1">
        <div className="flex-none flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <span
            className="flex items-center justify-center rounded-full flex-none"
            style={{ width: 36, height: 36, background: "var(--color-accent-100)", fontSize: 16 }}
            aria-hidden
          >
            💬
          </span>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm truncate">Funti Kidbooks Studio</span>
            <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
              {t.portal.guestChatSubtitle}
            </span>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
          <div className="flex flex-col items-start gap-1">
            <div
              className="rounded-[12px] px-3 py-2 text-sm max-w-[85%]"
              style={{ background: "var(--color-surface)", color: "var(--color-text)" }}
            >
              {t.portal.guestChatGreeting}
            </div>
          </div>
          {messages.map((m) => {
            const mine = m.sender_type === "visitor";
            return (
              <div key={m.id} className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                <div
                  className="rounded-[12px] px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words"
                  style={{
                    background: mine ? "var(--color-accent-500)" : "var(--color-surface)",
                    color: mine ? "#fff" : "var(--color-text)",
                  }}
                >
                  {m.content}
                </div>
                <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                  {formatTime(m.created_at)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex-none p-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          {chatError && (
            <p className="text-[12px] font-semibold" style={{ color: "var(--status-red)" }}>
              {chatError}
            </p>
          )}
          <form onSubmit={handleSend} className="flex items-center gap-2">
            <input
              className="input flex-1"
              placeholder={t.portal.guestChatPlaceholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" disabled={sending || !text.trim()} className="btn btn-primary btn-sm flex-none">
              {t.portal.guestChatSendBtn}
            </button>
          </form>
        </div>
      </div>

      {/* Info / sign-in column — Upwork's conversation rail, repurposed:
          there's only ever this one thread, so instead it holds the one
          thing worth doing there — turning it into a saved account. */}
      <div className="flex-none w-full sm:w-[260px] order-2 flex flex-col border-t sm:border-t-0 sm:border-l border-[var(--color-neutral-200)]">
        <div className="flex flex-col gap-3 p-4">
          <span className="font-bold text-sm">{t.portal.guestChatInfoTitle}</span>
          <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            {t.portal.guestChatLoginIntro}
          </p>
          <form onSubmit={handleLogin} className="flex flex-col gap-2">
            <input
              type="email"
              className="input"
              style={{ padding: "8px 10px", fontSize: 13 }}
              placeholder={t.portal.guestChatEmailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={loggingIn || !email.trim()} className="btn btn-secondary btn-sm w-full">
              {loggingIn ? t.portal.sending : t.portal.guestChatLoginBtn}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
