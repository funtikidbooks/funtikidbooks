"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  startVisitorConversation,
  sendVisitorMessage,
  getVisitorMessages,
  uploadVisitorImage,
  uploadVisitorFile,
} from "@/lib/actions/visitor-chat";
import { useDict } from "@/components/site/LocaleProvider";
import { visitorTypingChannelName, TYPING_IDLE_MS, TYPING_BROADCAST_THROTTLE_MS } from "@/lib/visitorTyping";
import { AttachmentGallery } from "@/components/ui/AttachmentGallery";
import type { FileAttachment, VisitorMessage } from "@/lib/types";

// Same localStorage keys as the floating "Chat với chúng tôi" widget
// (SupportChatWidget.tsx) — a visitor who chats here and later clicks the
// floating bubble elsewhere on the site (or vice versa) lands in the same
// thread, and claimVisitorConversation() (lib/actions/clientPortal.ts)
// reads these same keys once they sign in below.
export const GUEST_CHAT_ID_KEY = "funti-visitor-conversation-id";
export const GUEST_CHAT_TOKEN_KEY = "funti-visitor-token";
const POLL_MS = 4000;
const MAX_PENDING_ATTACHMENTS = 10;

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

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
            style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--color-neutral-500)", display: "inline-block", animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
    </span>
  );
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
  const [staffTyping, setStaffTyping] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const staffTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Only once a conversation exists — before the first message there's
  // nothing yet for staff to see this visitor typing about.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(visitorTypingChannelName(conversationId))
      .on("broadcast", { event: "typing" }, (msg) => {
        if ((msg.payload as { from?: string } | null)?.from !== "staff") return;
        setStaffTyping(true);
        if (staffTypingTimeoutRef.current) clearTimeout(staffTypingTimeoutRef.current);
        staffTypingTimeoutRef.current = setTimeout(() => setStaffTyping(false), TYPING_IDLE_MS);
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      typingChannelRef.current = null;
      if (staffTypingTimeoutRef.current) clearTimeout(staffTypingTimeoutRef.current);
      setStaffTyping(false);
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  function notifyTyping() {
    if (!typingChannelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSentAtRef.current < TYPING_BROADCAST_THROTTLE_MS) return;
    lastTypingSentAtRef.current = now;
    typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { from: "visitor" } });
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  // Closes the attach popover on any click outside it — it has no backdrop
  // of its own (unlike ImageLightbox), so this is what makes it feel
  // dismissible the way a native menu would.
  useEffect(() => {
    if (!attachMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) setAttachMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [attachMenuOpen]);

  async function handlePickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PENDING_ATTACHMENTS);
    if (files.length === 0) return;
    setUploading(true);
    setChatError(null);
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const formData = new FormData();
          formData.set("file", file);
          return uploadVisitorImage(formData, conversationId ?? undefined, token ?? undefined);
        }),
      );
      setPendingImages((prev) => [...prev, ...uploaded].slice(0, MAX_PENDING_ATTACHMENTS));
    } catch (err) {
      setChatError(err instanceof Error ? err.message : t.portal.guestChatSendError);
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PENDING_ATTACHMENTS);
    if (files.length === 0) return;
    setUploading(true);
    setChatError(null);
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const formData = new FormData();
          formData.set("file", file);
          return uploadVisitorFile(formData, conversationId ?? undefined, token ?? undefined);
        }),
      );
      setPendingFiles((prev) => [...prev, ...uploaded].slice(0, MAX_PENDING_ATTACHMENTS));
    } catch (err) {
      setChatError(err instanceof Error ? err.message : t.portal.guestChatSendError);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && pendingImages.length === 0 && pendingFiles.length === 0) || sending || uploading) return;
    setSending(true);
    setChatError(null);
    try {
      if (!conversationId || !token) {
        const result = await startVisitorConversation(undefined, undefined, trimmed, pendingImages, pendingFiles);
        localStorage.setItem(GUEST_CHAT_ID_KEY, result.conversationId);
        localStorage.setItem(GUEST_CHAT_TOKEN_KEY, result.token);
        setConversationId(result.conversationId);
        setToken(result.token);
        setMessages([result.message]);
      } else {
        const sent = await sendVisitorMessage(conversationId, token, trimmed, pendingImages, pendingFiles);
        setMessages((prev) => [...prev, sent]);
      }
      setText("");
      setPendingImages([]);
      setPendingFiles([]);
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

  const hasPending = pendingImages.length > 0 || pendingFiles.length > 0;

  return (
    <div className="card elev-lg flex flex-col sm:flex-row w-full" style={{ height: 560 }}>
      {/* Chat column — first in DOM so it's first on mobile too */}
      <div className="flex-1 flex flex-col min-h-0 order-1">
        <div className="flex-none flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <Image
            src="/brand/funti-logo.jpg"
            alt=""
            width={36}
            height={36}
            className="rounded-full object-cover flex-none"
          />
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
              <div key={m.id} className={`flex flex-col gap-1.5 ${mine ? "items-end" : "items-start"}`}>
                {m.content && (
                  <div
                    className="rounded-[12px] px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words"
                    style={{
                      background: mine ? "var(--color-accent-500)" : "var(--color-surface)",
                      color: mine ? "#fff" : "var(--color-text)",
                    }}
                  >
                    {m.content}
                  </div>
                )}
                <AttachmentGallery imageUrls={m.image_urls} fileAttachments={m.file_attachments} />
                <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                  {formatTime(m.created_at)}
                </span>
              </div>
            );
          })}
          {staffTyping && (
            <div className="flex flex-col items-start">
              <TypingDots label={t.portal.guestChatStaffTyping} />
            </div>
          )}
        </div>

        <div className="flex-none p-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          {chatError && (
            <p className="text-[12px] font-semibold" style={{ color: "var(--status-red)" }}>
              {chatError}
            </p>
          )}
          {hasPending && (
            <div className="flex flex-wrap gap-1.5">
              {pendingImages.map((url) => (
                <div key={url} className="relative rounded-[8px] overflow-hidden flex-none" style={{ width: 48, height: 48 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPendingImages((prev) => prev.filter((u) => u !== url))}
                    aria-label={t.portal.guestChatRemoveAttachment}
                    className="absolute flex items-center justify-center rounded-full"
                    style={{ top: 2, right: 2, width: 16, height: 16, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 9 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {pendingFiles.map((f) => (
                <div
                  key={f.url}
                  className="relative flex items-center gap-1.5 rounded-[8px] pl-2.5 pr-6 py-1.5 text-[12px] font-semibold flex-none"
                  style={{ background: "var(--color-surface)" }}
                >
                  📄 {f.name}
                  <button
                    type="button"
                    onClick={() => setPendingFiles((prev) => prev.filter((x) => x.url !== f.url))}
                    aria-label={t.portal.guestChatRemoveAttachment}
                    className="absolute flex items-center justify-center rounded-full"
                    style={{ top: "50%", right: 4, transform: "translateY(-50%)", width: 16, height: 16, background: "rgba(0,0,0,.15)", fontSize: 9 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleSend} className="flex items-center gap-2">
            <input
              className="input flex-1"
              placeholder={t.portal.guestChatPlaceholder}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                notifyTyping();
              }}
            />
            {/* Attach sits right beside Send, both the same pill shape and
                size (btn-sm) — a matched secondary/primary pair instead of
                a plain grey circle floating apart from an orange pill. */}
            <div ref={attachMenuRef} className="relative flex-none">
              <button
                type="button"
                onClick={() => setAttachMenuOpen((v) => !v)}
                disabled={uploading}
                aria-label={t.portal.guestChatAttachLabel}
                title={t.portal.guestChatAttachLabel}
                className="btn btn-secondary btn-sm flex-none"
                style={{ padding: "8px 10px" }}
              >
                {uploading ? "…" : "📎"}
              </button>
              {attachMenuOpen && (
                <div
                  className="fk-popup-in card elev-lg absolute flex flex-col p-1.5 gap-0.5"
                  style={{ bottom: "calc(100% + 8px)", right: 0, width: 160, transformOrigin: "100% 100%" }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      imageInputRef.current?.click();
                    }}
                    className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm font-semibold text-left"
                  >
                    🖼️ {t.portal.guestChatAttachImages}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm font-semibold text-left"
                  >
                    📄 {t.portal.guestChatAttachFiles}
                  </button>
                </div>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={handlePickImages}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip"
                multiple
                className="hidden"
                onChange={handlePickFiles}
              />
            </div>
            <button
              type="submit"
              disabled={sending || uploading || (!text.trim() && !hasPending)}
              className="btn btn-primary btn-sm flex-none"
            >
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
