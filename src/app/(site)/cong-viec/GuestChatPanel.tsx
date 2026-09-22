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

// The Upwork-messenger-style panel for the signed-out state of Work With
// Funti: a visitor can start typing immediately, no form first — every
// message lands straight in visitor_messages, which staff already watch
// live in /workspace/khach-hang (see ClientProjectsInbox.tsx), same as the
// floating widget. Underneath, a one-field email prompt lets them turn this
// into a real account; the conversation itself carries over automatically
// (claimVisitorConversation) once they do.
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
    <div className="card elev-sm flex flex-col w-full max-w-[520px] mx-auto" style={{ height: 480 }}>
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

      <form
        onSubmit={handleLogin}
        className="flex-none flex flex-col gap-2 p-3"
        style={{ borderTop: "1px solid var(--color-neutral-200)", background: "var(--color-surface)" }}
      >
        <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
          {t.portal.guestChatLoginIntro}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="email"
            className="input flex-1"
            style={{ padding: "6px 10px", fontSize: 13 }}
            placeholder={t.portal.guestChatEmailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={loggingIn || !email.trim()}
            className="btn btn-secondary btn-sm flex-none"
          >
            {loggingIn ? t.portal.sending : t.portal.guestChatLoginBtn}
          </button>
        </div>
      </form>
    </div>
  );
}
