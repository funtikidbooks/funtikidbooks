"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getClientProjectMessagesForStaff,
  markProjectReadByStaff,
  sendStaffReplyToClient,
} from "@/lib/actions/clientPortal";
import type { ClientMessage, ClientProfile, ClientProject } from "@/lib/types";

type ProjectWithClient = ClientProject & { client: ClientProfile | null };

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

function labelFor(p: ProjectWithClient) {
  return p.client?.display_name?.trim() || p.client?.email || `Khách #${p.id.slice(0, 4)}`;
}

export function ClientProjectsInbox({ initialProjects }: { initialProjects: ProjectWithClient[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [activeId, setActiveId] = useState<string | null>(initialProjects[0]?.id ?? null);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [unreadByProject, setUnreadByProject] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const p of initialProjects) map[p.id] = true; // refined below once messages load
    return map;
  });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => projects.find((p) => p.id === activeId) ?? null, [projects, activeId]);

  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    getClientProjectMessagesForStaff(activeId).then((msgs) => {
      if (cancelled) return;
      setMessages(msgs);
      const hasUnread = msgs.some((m) => m.sender_type === "client" && !m.read_by_staff);
      if (hasUnread) {
        markProjectReadByStaff(activeId).then(() => {
          setUnreadByProject((prev) => ({ ...prev, [activeId]: false }));
        });
      } else {
        setUnreadByProject((prev) => ({ ...prev, [activeId]: false }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("client-messages-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_messages" }, (payload) => {
        const row = payload.new as ClientMessage;
        setProjects((prev) =>
          prev
            .map((p) => (p.id === row.project_id ? { ...p, last_message_at: row.created_at } : p))
            .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
        );
        if (row.sender_type === "client" && row.project_id !== activeIdRef.current) {
          setUnreadByProject((prev) => ({ ...prev, [row.project_id]: true }));
        }
        setMessages((prev) => {
          if (row.project_id !== activeIdRef.current) return prev;
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
      const sent = await sendStaffReplyToClient(active.id, text.trim());
      setMessages((prev) => [...prev, sent]);
      setProjects((prev) =>
        prev.map((p) => (p.id === active.id ? { ...p, last_message_at: sent.created_at } : p)),
      );
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-[300px] flex-none overflow-y-auto" style={{ borderRight: "1px solid var(--color-neutral-200)" }}>
        {projects.length === 0 ? (
          <p className="p-4 text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có khách hàng nào gửi dự án.
          </p>
        ) : (
          projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className="w-full flex items-center gap-2 px-3 py-3 text-left"
              style={{
                background: p.id === activeId ? "var(--color-accent-100)" : undefined,
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
                  labelFor(p).charAt(0).toUpperCase()
                )}
              </span>
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-[13px] font-bold truncate" style={{ fontWeight: unreadByProject[p.id] ? 800 : 700 }}>
                  {labelFor(p)}
                </span>
                <span className="text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                  {p.client?.country ? `${p.client.country} · ` : ""}
                  {p.description}
                </span>
              </span>
              {unreadByProject[p.id] && (
                <span className="rounded-full flex-none" style={{ width: 9, height: 9, background: "var(--status-red)" }} />
              )}
            </button>
          ))
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Chọn một dự án để xem
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="font-bold text-sm flex-none">{labelFor(active)}</span>
                {active.client?.email && (
                  <a href={`mailto:${active.client.email}`} className="text-[12px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                    {active.client.email}
                  </a>
                )}
                {active.client?.client_type && (
                  <span className="tag tag-neutral text-[10px] flex-none">
                    {active.client.client_type === "business" ? "B2B" : "Cá nhân"}
                  </span>
                )}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
              <div className="flex flex-col items-start gap-1">
                <div className="rounded-[12px] px-3 py-2 text-sm max-w-[70%]" style={{ background: "var(--color-surface)" }}>
                  {active.description}
                </div>
                {active.image_urls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {active.image_urls.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt="" className="rounded-[8px] object-cover" style={{ width: 72, height: 72 }} />
                    ))}
                  </div>
                )}
                <span className="text-[10px]" style={{ color: "var(--color-neutral-500)" }}>
                  {formatTime(active.created_at)}
                </span>
              </div>

              {messages.map((m) => {
                const fromClient = m.sender_type === "client";
                return (
                  <div key={m.id} className={`flex flex-col gap-1 ${fromClient ? "items-start" : "items-end"}`}>
                    <div
                      className="rounded-[12px] px-3 py-1.5 text-[13px] max-w-[70%] whitespace-pre-wrap break-words"
                      style={{
                        background: fromClient ? "var(--color-surface)" : "var(--color-accent-500)",
                        color: fromClient ? "var(--color-text)" : "#fff",
                      }}
                    >
                      {m.content}
                    </div>
                    {m.image_urls.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.image_urls.map((url) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={url} src={url} alt="" className="rounded-[8px] object-cover" style={{ width: 72, height: 72 }} />
                        ))}
                      </div>
                    )}
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
                />
                <button type="submit" disabled={sending || !text.trim()} className="btn btn-primary btn-sm flex-none">
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
