"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { visitorTypingChannelName, TYPING_IDLE_MS, TYPING_BROADCAST_THROTTLE_MS } from "@/lib/visitorTyping";
import {
  getClientProjectMessagesForStaff,
  markProjectReadByStaff,
  sendStaffReplyToClient,
  uploadStaffReplyImage,
} from "@/lib/actions/clientPortal";
import {
  closeVisitorConversation,
  getVisitorConversationMessages,
  markVisitorConversationRead,
  sendStaffReply,
} from "@/lib/actions/support-chat";
import { ImageLightbox } from "@/components/workspace/ImageLightbox";
import type { ClientMessage, ClientProfile, ClientProject, VisitorConversation, VisitorMessage } from "@/lib/types";

type ProjectWithClient = ClientProject & { client: ClientProfile | null };

// One inbox, two sources: a signed-in client's project (Công việc) and an
// anonymous site visitor's message (the "Chat với Funti Kidbooks" widget) —
// director/PM used to check /workspace/khach-hang and /quan-tri/chat
// separately for these; everything below normalizes both into one rail,
// one thread view, one reply box, so there's only one place to check.
type ActiveRef = { kind: "client"; id: string } | { kind: "visitor"; id: string };

type NormalizedMessage = {
  id: string;
  fromCustomer: boolean;
  content: string;
  imageUrls: string[];
  createdAt: string;
};

function fromClientMessage(m: ClientMessage): NormalizedMessage {
  return { id: m.id, fromCustomer: m.sender_type === "client", content: m.content, imageUrls: m.image_urls, createdAt: m.created_at };
}

function fromVisitorMessage(m: VisitorMessage): NormalizedMessage {
  return { id: m.id, fromCustomer: m.sender_type === "visitor", content: m.content, imageUrls: [], createdAt: m.created_at };
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

function labelForProject(p: ProjectWithClient) {
  return p.client?.display_name?.trim() || p.client?.email || `Khách #${p.id.slice(0, 4)}`;
}

function labelForVisitor(c: VisitorConversation) {
  return c.visitor_name?.trim() || `Khách #${c.id.slice(0, 4)}`;
}

// Same "typing…" broadcast dots as the internal 1-1 chat (DirectConversation.tsx).
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

export function ClientProjectsInbox({
  initialProjects,
  initialVisitorConversations,
}: {
  initialProjects: ProjectWithClient[];
  initialVisitorConversations: VisitorConversation[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [visitorConvos, setVisitorConvos] = useState(initialVisitorConversations);
  const [unreadByProject, setUnreadByProject] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<ActiveRef | null>(() => {
    if (initialProjects[0]) return { kind: "client", id: initialProjects[0].id };
    if (initialVisitorConversations[0]) return { kind: "visitor", id: initialVisitorConversations[0].id };
    return null;
  });
  const [messages, setMessages] = useState<NormalizedMessage[]>([]);
  const [text, setText] = useState("");
  // Client-project messages only — visitor_messages has no image_urls
  // column, so the picker below is hidden entirely for a visitor thread.
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [visitorTyping, setVisitorTyping] = useState(false);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const visitorTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);

  const activeProject = useMemo(
    () => (active?.kind === "client" ? (projects.find((p) => p.id === active.id) ?? null) : null),
    [active, projects],
  );
  const activeVisitor = useMemo(
    () => (active?.kind === "visitor" ? (visitorConvos.find((c) => c.id === active.id) ?? null) : null),
    [active, visitorConvos],
  );

  // Sorted purely for the rail — the two source arrays each keep their own
  // shape/state untouched.
  const items = useMemo(() => {
    const clientItems = projects.map((p) => ({ kind: "client" as const, id: p.id, lastMessageAt: p.last_message_at }));
    const visitorItems = visitorConvos.map((c) => ({ kind: "visitor" as const, id: c.id, lastMessageAt: c.last_message_at }));
    return [...clientItems, ...visitorItems].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }, [projects, visitorConvos]);

  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Load the thread + clear unread whenever the selected item changes.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    if (active.kind === "client") {
      getClientProjectMessagesForStaff(active.id).then((msgs) => {
        if (cancelled) return;
        setMessages(msgs.map(fromClientMessage));
        const hasUnread = msgs.some((m) => m.sender_type === "client" && !m.read_by_staff);
        if (hasUnread) markProjectReadByStaff(active.id);
        setUnreadByProject((prev) => ({ ...prev, [active.id]: false }));
      });
    } else {
      getVisitorConversationMessages(active.id).then((msgs) => {
        if (cancelled) return;
        setMessages(msgs.map(fromVisitorMessage));
      });
      markVisitorConversationRead(active.id);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisitorConvos((prev) => prev.map((c) => (c.id === active.id ? { ...c, unread: false } : c)));
    }
    return () => {
      cancelled = true;
    };
  }, [active]);

  // Joins the guest's own typing channel (GuestChatPanel.tsx) only while a
  // visitor thread is open — re-joins whenever `active` switches to a
  // different visitor, and leaves it entirely for a client-project thread
  // or when nothing is selected.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisitorTyping(false);
    if (active?.kind !== "visitor") return;
    const supabase = createClient();
    const channel = supabase
      .channel(visitorTypingChannelName(active.id))
      .on("broadcast", { event: "typing" }, (msg) => {
        if ((msg.payload as { from?: string } | null)?.from !== "visitor") return;
        setVisitorTyping(true);
        if (visitorTypingTimeoutRef.current) clearTimeout(visitorTypingTimeoutRef.current);
        visitorTypingTimeoutRef.current = setTimeout(() => setVisitorTyping(false), TYPING_IDLE_MS);
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      typingChannelRef.current = null;
      if (visitorTypingTimeoutRef.current) clearTimeout(visitorTypingTimeoutRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.kind === "visitor" ? active.id : null]);

  function notifyVisitorTyping() {
    if (!typingChannelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSentAtRef.current < TYPING_BROADCAST_THROTTLE_MS) return;
    lastTypingSentAtRef.current = now;
    typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { from: "staff" } });
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("customer-inbox-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_messages" }, (payload) => {
        const row = payload.new as ClientMessage;
        setProjects((prev) =>
          prev.map((p) => (p.id === row.project_id ? { ...p, last_message_at: row.created_at } : p)),
        );
        const isActive = activeRef.current?.kind === "client" && activeRef.current.id === row.project_id;
        if (row.sender_type === "client" && !isActive) {
          setUnreadByProject((prev) => ({ ...prev, [row.project_id]: true }));
        }
        if (isActive) {
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, fromClientMessage(row)]));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visitor_messages" }, (payload) => {
        const row = payload.new as VisitorMessage;
        const isActive = activeRef.current?.kind === "visitor" && activeRef.current.id === row.conversation_id;
        setVisitorConvos((prev) =>
          prev.map((c) =>
            c.id === row.conversation_id
              ? { ...c, last_message_at: row.created_at, unread: row.sender_type === "visitor" && !isActive }
              : c,
          ),
        );
        if (isActive) {
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, fromVisitorMessage(row)]));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleReplyFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploadingImage(true);
    setError(null);
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const formData = new FormData();
          formData.set("file", file);
          return uploadStaffReplyImage(formData);
        }),
      );
      setReplyImages((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải ảnh lên");
    } finally {
      setUploadingImage(false);
      if (replyFileRef.current) replyFileRef.current.value = "";
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const hasImages = active?.kind === "client" && replyImages.length > 0;
    if (!active || (!text.trim() && !hasImages) || sending) return;
    setSending(true);
    setError(null);
    try {
      if (active.kind === "client") {
        const sent = await sendStaffReplyToClient(active.id, text.trim(), replyImages);
        setMessages((prev) => [...prev, fromClientMessage(sent)]);
        setProjects((prev) => prev.map((p) => (p.id === active.id ? { ...p, last_message_at: sent.created_at } : p)));
        setReplyImages([]);
      } else {
        const sent = await sendStaffReply(active.id, text.trim());
        setMessages((prev) => [...prev, fromVisitorMessage(sent)]);
        setVisitorConvos((prev) =>
          prev.map((c) => (c.id === active.id ? { ...c, last_message_at: sent.created_at } : c)),
        );
      }
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSending(false);
    }
  }

  async function handleCloseVisitor() {
    if (!activeVisitor) return;
    if (!confirm(`Đóng cuộc trò chuyện với ${labelForVisitor(activeVisitor)}?`)) return;
    await closeVisitorConversation(activeVisitor.id);
    setVisitorConvos((prev) => prev.map((c) => (c.id === activeVisitor.id ? { ...c, status: "closed" } : c)));
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div
        className={`${active ? "hidden" : "flex"} sm:flex w-full sm:w-[300px] flex-none flex-col overflow-y-auto`}
        style={{ borderRight: "1px solid var(--color-neutral-200)" }}
      >
        {items.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có khách hàng nào nhắn tin.
          </p>
        ) : (
          items.map((item) => {
            if (item.kind === "client") {
              const p = projects.find((x) => x.id === item.id);
              if (!p) return null;
              const unread = unreadByProject[p.id];
              const isActive = active?.kind === "client" && active.id === p.id;
              return (
                <button
                  key={`client-${p.id}`}
                  type="button"
                  onClick={() => setActive({ kind: "client", id: p.id })}
                  className="w-full flex items-center gap-2 px-3 py-3 text-left"
                  style={{
                    background: isActive ? "var(--color-accent-100)" : undefined,
                    borderBottom: "1px solid var(--color-neutral-200)",
                    opacity: p.status === "closed" ? 0.55 : 1,
                  }}
                >
                  <span
                    className="flex items-center justify-center rounded-full text-xs font-bold flex-none overflow-hidden"
                    style={{ width: 32, height: 32, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                  >
                    {p.client?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.client.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      labelForProject(p).charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-[13px] font-bold truncate" style={{ fontWeight: unread ? 800 : 700 }}>
                      {labelForProject(p)}
                    </span>
                    <span className="text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                      {p.client?.country ? `${p.client.country} · ` : ""}
                      {p.description}
                    </span>
                  </span>
                  {unread && <span className="rounded-full flex-none" style={{ width: 9, height: 9, background: "var(--status-red)" }} />}
                </button>
              );
            }

            const c = visitorConvos.find((x) => x.id === item.id);
            if (!c) return null;
            const isActive = active?.kind === "visitor" && active.id === c.id;
            return (
              <button
                key={`visitor-${c.id}`}
                type="button"
                onClick={() => setActive({ kind: "visitor", id: c.id })}
                className="w-full flex items-center gap-2 px-3 py-3 text-left"
                style={{
                  background: isActive ? "var(--color-accent-100)" : undefined,
                  borderBottom: "1px solid var(--color-neutral-200)",
                  opacity: c.status === "closed" ? 0.55 : 1,
                }}
              >
                <span
                  className="flex items-center justify-center rounded-full text-xs font-bold flex-none"
                  style={{ width: 32, height: 32, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                >
                  {labelForVisitor(c).charAt(0).toUpperCase()}
                </span>
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="text-[13px] font-bold truncate" style={{ fontWeight: c.unread ? 800 : 700 }}>
                    {labelForVisitor(c)}
                  </span>
                  <span className="text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                    Khách vãng lai · chat trên web
                  </span>
                </span>
                {c.unread && <span className="rounded-full flex-none" style={{ width: 9, height: 9, background: "var(--status-red)" }} />}
              </button>
            );
          })
        )}
      </div>

      <div className={`${active ? "flex" : "hidden"} sm:flex flex-1 flex-col min-h-0`}>
        {!activeProject && !activeVisitor ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Chọn một cuộc trò chuyện để xem
          </div>
        ) : (
          <>
            {/* Consolidated client/visitor profile snapshot — per sếp Phúc,
                customer info should read clearly in one place instead of
                scattered bits, whether it's a signed-in client (several
                projects can share one identity) or an anonymous visitor. */}
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="btn-icon sm:hidden flex-none"
                  style={{ width: 30, height: 30, padding: 0 }}
                  aria-label="Quay lại danh sách"
                >
                  ←
                </button>
                {activeProject ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="flex items-center justify-center rounded-full text-sm font-bold overflow-hidden flex-none"
                      style={{ width: 40, height: 40, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                    >
                      {activeProject.client?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={activeProject.client.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        labelForProject(activeProject).charAt(0).toUpperCase()
                      )}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="flex items-baseline gap-2 min-w-0">
                        <span className="font-bold text-sm truncate">{labelForProject(activeProject)}</span>
                        {activeProject.client?.client_type && (
                          <span className="tag tag-neutral text-[10px] flex-none">
                            {activeProject.client.client_type === "business" ? "B2B" : "Cá nhân"}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2.5 text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
                        {activeProject.client?.email && (
                          <a href={`mailto:${activeProject.client.email}`} className="truncate" style={{ color: "inherit" }}>
                            {activeProject.client.email}
                          </a>
                        )}
                        {activeProject.client?.country && <span>{activeProject.client.country}</span>}
                        <span>{projects.filter((p) => p.client_id === activeProject.client_id).length} dự án đã gửi</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  activeVisitor && (
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="font-bold text-sm flex-none">{labelForVisitor(activeVisitor)}</span>
                      <span className="tag tag-neutral text-[10px] flex-none">Khách vãng lai</span>
                      {activeVisitor.visitor_email && (
                        <a
                          href={`mailto:${activeVisitor.visitor_email}`}
                          className="text-[12px] truncate"
                          style={{ color: "var(--color-neutral-500)" }}
                        >
                          {activeVisitor.visitor_email}
                        </a>
                      )}
                    </span>
                  )
                )}
              </div>
              {activeVisitor?.status === "open" && (
                <button type="button" className="btn btn-ghost btn-sm flex-none" onClick={handleCloseVisitor}>
                  Đóng trò chuyện
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
              {activeProject && (
                <div className="flex flex-col items-start gap-1">
                  <div className="rounded-[12px] px-3 py-2 text-sm max-w-[70%]" style={{ background: "var(--color-surface)" }}>
                    {activeProject.description}
                  </div>
                  {activeProject.image_urls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeProject.image_urls.map((url) => (
                        <button key={url} type="button" onClick={() => setLightboxUrl(url)} className="flex-none">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="rounded-[8px] object-cover" style={{ width: 72, height: 72 }} />
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="text-[10px]" style={{ color: "var(--color-neutral-500)" }}>
                    {formatTime(activeProject.created_at)}
                  </span>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className={`flex flex-col gap-1 ${m.fromCustomer ? "items-start" : "items-end"}`}>
                  {m.content && (
                    <div
                      className="rounded-[12px] px-3 py-1.5 text-[13px] max-w-[70%] whitespace-pre-wrap break-words"
                      style={{
                        background: m.fromCustomer ? "var(--color-surface)" : "var(--color-accent-500)",
                        color: m.fromCustomer ? "var(--color-text)" : "#fff",
                      }}
                    >
                      {m.content}
                    </div>
                  )}
                  {m.imageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.imageUrls.map((url) => (
                        <button key={url} type="button" onClick={() => setLightboxUrl(url)} className="flex-none">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="rounded-[8px] object-cover" style={{ width: 72, height: 72 }} />
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="text-[10px] mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
                    {formatTime(m.createdAt)}
                  </span>
                </div>
              ))}
              {visitorTyping && (
                <div className="flex flex-col items-start">
                  <TypingDots label="Khách đang gõ" />
                </div>
              )}
            </div>

            <div className="flex-none p-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
              {error && (
                <p className="text-[12px] font-semibold" style={{ color: "var(--status-red)" }}>
                  {error}
                </p>
              )}
              {active?.kind === "client" && (
                <div className="flex flex-wrap gap-1.5">
                  {replyImages.map((url) => (
                    <div key={url} className="relative rounded-[8px] overflow-hidden flex-none" style={{ width: 48, height: 48 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setReplyImages((prev) => prev.filter((u) => u !== url))}
                        className="absolute flex items-center justify-center rounded-full"
                        style={{ top: 2, right: 2, width: 16, height: 16, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 9 }}
                        aria-label="Bỏ ảnh"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => replyFileRef.current?.click()}
                    disabled={uploadingImage}
                    className="flex items-center justify-center rounded-[8px] flex-none"
                    style={{ width: 48, height: 48, border: "1.5px dashed var(--color-neutral-300)", color: "var(--color-neutral-500)", fontSize: 16 }}
                    aria-label="Đính kèm ảnh"
                    title="Đính kèm ảnh"
                  >
                    {uploadingImage ? "…" : "📎"}
                  </button>
                  <input
                    ref={replyFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleReplyFiles}
                  />
                </div>
              )}
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  placeholder="Trả lời khách…"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (active?.kind === "visitor") notifyVisitorTyping();
                  }}
                  disabled={activeVisitor?.status === "closed"}
                />
                <button
                  type="submit"
                  disabled={sending || (!text.trim() && replyImages.length === 0) || activeVisitor?.status === "closed"}
                  className="btn btn-primary btn-sm flex-none"
                >
                  Gửi
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
