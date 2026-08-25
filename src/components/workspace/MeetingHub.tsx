"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import {
  createChannel,
  deleteChannel,
  getMeetingMessages,
  joinChannel,
  leaveChannel,
  listChannels,
  sendMeetingMessage,
} from "@/lib/actions/meetings";
import type { MeetingChannelPublic, MeetingMessage, Profile } from "@/lib/types";

const ROOM_ICONS = ["💬", "🎨", "📚", "🎬", "🧵", "🛠", "📣", "🎯"];

function formatTime(date: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function isImage(mime: string | null) {
  return !!mime && mime.startsWith("image/");
}

// Very small "is this a link" check — good enough to auto-linkify a Drive
// link or any URL a member pastes into the chat.
function linkify(text: string): (string | { url: string })[] {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part) => (/^https?:\/\//.test(part) ? { url: part } : part));
}

function Avatar({ profile, size = 28 }: { profile: Pick<Profile, "display_name" | "avatar_url"> | undefined; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold flex-none overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.4, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
    >
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        (profile?.display_name ?? "?").charAt(0).toUpperCase()
      )}
    </span>
  );
}

function CreateRoomModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [locked, setLocked] = useState(false);
  const [icon, setIcon] = useState(ROOM_ICONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (locked && !password.trim()) {
      setError("Nhập mật khẩu cho phòng riêng tư");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await createChannel(name, locked ? password : "", icon);
      onCreated(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={420}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2 className="text-lg">Tạo phòng mới</h2>

        <div className="field">
          <label>Biểu tượng</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {ROOM_ICONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setIcon(e)}
                className="btn-icon"
                style={{
                  width: 34,
                  height: 34,
                  fontSize: 16,
                  background: icon === e ? "var(--color-accent-500)" : "var(--color-surface)",
                  border: `1.5px solid ${icon === e ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="room-name">Tên phòng *</label>
          <input
            id="room-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder="VD: Team Illustration"
            required
            autoFocus
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
          🔒 Đặt mật khẩu (phòng riêng tư)
        </label>

        {locked && (
          <div className="field">
            <label htmlFor="room-password">Mật khẩu</label>
            <input
              id="room-password"
              type="text"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mật khẩu để tham gia phòng"
            />
          </div>
        )}

        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-ghost" disabled={saving}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
            {saving ? "Đang tạo…" : "Tạo phòng"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BrowseRoomsModal({
  rooms,
  onClose,
  onJoined,
}: {
  rooms: MeetingChannelPublic[];
  onClose: () => void;
  onJoined: (id: string) => void;
}) {
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(id: string, pwd: string) {
    setBusyId(id);
    setError(null);
    try {
      await joinChannel(id, pwd);
      setPasswordFor(null);
      setPassword("");
      onJoined(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg">Khám phá phòng</h2>
        {rooms.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Không có phòng nào để tham gia.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rooms.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-[10px] px-3 py-2.5" style={{ background: "var(--color-surface)" }}>
                <div className="flex items-center gap-2">
                  <span aria-hidden>{r.icon}</span>
                  <span className="text-sm font-bold flex-1 truncate">{r.name}</span>
                  {r.has_password && <span aria-hidden title="Có mật khẩu">🔒</span>}
                  {passwordFor === r.id ? null : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm flex-none"
                      disabled={busyId === r.id}
                      onClick={() => (r.has_password ? setPasswordFor(r.id) : join(r.id, ""))}
                    >
                      {busyId === r.id ? "Đang vào…" : "Tham gia"}
                    </button>
                  )}
                </div>
                {passwordFor === r.id && (
                  <div className="flex items-center gap-2">
                    <input
                      className="input flex-1"
                      style={{ padding: "6px 10px", fontSize: 13 }}
                      type="text"
                      placeholder="Nhập mật khẩu"
                      value={password}
                      autoFocus
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm flex-none"
                      disabled={busyId === r.id}
                      onClick={() => join(r.id, password)}
                    >
                      Vào
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function MeetingHub({
  currentUser,
  profiles,
  initialChannels,
}: {
  currentUser: { id: string; display_name: string };
  profiles: Profile[];
  initialChannels: MeetingChannelPublic[];
}) {
  const [channels, setChannels] = useState(initialChannels);
  const [activeId, setActiveId] = useState<string | null>(
    initialChannels.find((c) => c.is_general)?.id ?? initialChannels[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const joinedRooms = useMemo(() => channels.filter((c) => c.joined), [channels]);
  const browsableRooms = useMemo(() => channels.filter((c) => !c.joined), [channels]);
  const activeChannel = channels.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    getMeetingMessages(activeId)
      .then((msgs) => !cancelled && setMessages(msgs))
      .catch(() => !cancelled && setMessages([]));
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`meeting-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_messages", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const row = payload.new as MeetingMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [activeId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  function refreshChannel(id: string, patch: Partial<MeetingChannelPublic>) {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function handleCreated(id: string) {
    const fresh = await listChannels().catch(() => null);
    if (fresh) setChannels(fresh);
    setActiveId(id);
  }

  function handleJoined(id: string) {
    refreshChannel(id, { joined: true });
    setShowBrowse(false);
    setActiveId(id);
  }

  async function handleLeave(id: string) {
    if (!confirm("Rời khỏi phòng này?")) return;
    await leaveChannel(id);
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, joined: false } : c)));
    if (activeId === id) {
      setActiveId(channels.find((c) => c.is_general)?.id ?? null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Xoá phòng này? Toàn bộ tin nhắn sẽ mất.")) return;
    await deleteChannel(id);
    setChannels((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(channels.find((c) => c.is_general)?.id ?? null);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId) return;
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
      const sent = await sendMeetingMessage(activeId, trimmed, formData);
      if (sent) setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể gửi tin nhắn.");
      setText(trimmed);
      setPendingFile(file ?? null);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Room list */}
      <div
        className="w-[240px] flex-none hidden sm:flex flex-col gap-3 px-3 py-4"
        style={{ borderRight: "1px solid var(--color-neutral-200)" }}
      >
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: "var(--color-neutral-500)" }}>
            PHÒNG HỌP
          </span>
          <button type="button" onClick={() => setShowCreate(true)} className="btn-icon" style={{ width: 24, height: 24, padding: 0 }} aria-label="Tạo phòng">
            ＋
          </button>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto flex-1">
          {joinedRooms.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveId(r.id)}
              className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-left text-[13px] font-semibold"
              style={{
                background: activeId === r.id ? "var(--color-accent-100)" : undefined,
                color: activeId === r.id ? "var(--color-accent-700)" : "var(--color-text)",
              }}
            >
              <span aria-hidden>{r.icon}</span>
              <span className="flex-1 truncate">{r.name}</span>
              {r.has_password && !r.is_general && (
                <span aria-hidden style={{ fontSize: 11 }}>🔒</span>
              )}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setShowBrowse(true)} className="btn btn-secondary btn-sm w-full">
          🔍 Khám phá phòng
          {browsableRooms.length > 0 && ` (${browsableRooms.length})`}
        </button>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Chọn hoặc tạo một phòng để bắt đầu trò chuyện.
          </div>
        ) : (
          <>
            <div
              className="flex-none flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
            >
              <span aria-hidden style={{ fontSize: 18 }}>{activeChannel.icon}</span>
              <span className="font-bold flex-1 truncate">{activeChannel.name}</span>
              {!activeChannel.is_general && (
                <>
                  <button type="button" onClick={() => handleLeave(activeChannel.id)} className="btn btn-ghost btn-sm">
                    Rời phòng
                  </button>
                  {activeChannel.created_by === currentUser.id && (
                    <button type="button" onClick={() => handleDelete(activeChannel.id)} className="btn btn-danger btn-sm">
                      Xoá phòng
                    </button>
                  )}
                </>
              )}
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
              {messages.length === 0 && (
                <p className="text-[13px] text-center mt-4" style={{ color: "var(--color-neutral-500)" }}>
                  Chưa có tin nhắn nào trong phòng này.
                </p>
              )}
              {messages.map((m) => {
                const sender = profileById.get(m.sender_id);
                const mine = m.sender_id === currentUser.id;
                return (
                  <div key={m.id} className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                    <Avatar profile={sender} />
                    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} max-w-[75%]`}>
                      <span className="text-[11px] font-semibold mb-0.5" style={{ color: "var(--color-neutral-500)" }}>
                        {mine ? "Bạn" : (sender?.display_name ?? "Ẩn danh")}
                      </span>
                      {m.content && (
                        <div
                          className="rounded-[12px] px-3 py-2 text-sm whitespace-pre-wrap break-words"
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
                              style={{ maxWidth: 240, maxHeight: 240 }}
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
                  </div>
                );
              })}
            </div>

            <div className="flex-none" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
              {error && (
                <p className="text-[12px] font-semibold px-4 pt-2" style={{ color: "var(--status-red)" }}>
                  {error}
                </p>
              )}
              {pendingFile && (
                <div className="flex items-center gap-1.5 px-4 pt-2">
                  <span
                    className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] font-semibold truncate max-w-full"
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
                    style={{ width: 22, height: 22, padding: 0, fontSize: 12 }}
                    aria-label="Bỏ tệp đính kèm"
                  >
                    ✕
                  </button>
                </div>
              )}
              <form onSubmit={handleSend} className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-icon flex-none"
                  style={{ width: 34, height: 34, padding: 0 }}
                  aria-label="Gửi ảnh hoặc tệp"
                >
                  📎
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
                  className="input flex-1"
                  placeholder={`Nhắn vào #${activeChannel.name}…`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button type="submit" disabled={sending} className="btn btn-primary flex-none">
                  Gửi
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
      {showBrowse && (
        <BrowseRoomsModal rooms={browsableRooms} onClose={() => setShowBrowse(false)} onJoined={handleJoined} />
      )}
    </div>
  );
}
