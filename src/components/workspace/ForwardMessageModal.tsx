"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { listChannels, forwardMeetingMessage } from "@/lib/actions/meetings";
import { listWorkspaceProfiles } from "@/lib/actions/profile";
import { forwardDirectMessage } from "@/lib/actions/messages";
import type { MeetingChannelPublic, Profile } from "@/lib/types";

export type ForwardableAttachment = { url: string; filename: string | null; mime: string | null; size: number | null } | null;

// Picks a destination (a room you're already in, or a teammate's DM) and
// re-sends the source message's content/attachment there — the attachment
// URL is reused as-is rather than re-uploaded. Fetches its own room/roster
// lists so it can be dropped into either the group-chat or DM message
// actions without prop-drilling that data down from the page.
export function ForwardMessageModal({
  content,
  attachment,
  currentUserId,
  onClose,
}: {
  content: string;
  attachment: ForwardableAttachment;
  currentUserId: string;
  onClose: () => void;
}) {
  const [rooms, setRooms] = useState<MeetingChannelPublic[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [query, setQuery] = useState("");
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listChannels().then((cs) => setRooms(cs.filter((c) => c.joined))).catch(() => setRooms([]));
    listWorkspaceProfiles().then(setProfiles).catch(() => setProfiles([]));
  }, []);

  const q = query.trim().toLowerCase();
  const filteredRooms = useMemo(
    () => (rooms ?? []).filter((r) => !q || r.name.toLowerCase().includes(q)),
    [rooms, q],
  );
  const filteredPeers = useMemo(
    () => (profiles ?? []).filter((p) => p.id !== currentUserId && (!q || p.display_name.toLowerCase().includes(q))),
    [profiles, q, currentUserId],
  );

  async function sendToRoom(room: MeetingChannelPublic) {
    const key = `room-${room.id}`;
    setBusyKey(key);
    setError(null);
    try {
      await forwardMeetingMessage(room.id, content, attachment);
      setSentTo((prev) => new Set(prev).add(key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusyKey(null);
    }
  }

  async function sendToPeer(peer: Profile) {
    const key = `peer-${peer.id}`;
    setBusyKey(key);
    setError(null);
    try {
      await forwardDirectMessage(peer.id, content, attachment);
      setSentTo((prev) => new Set(prev).add(key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusyKey(null);
    }
  }

  const loading = rooms === null || profiles === null;

  return (
    <Modal onClose={onClose} maxWidth={420}>
      <div className="flex flex-col gap-3 p-5" style={{ maxHeight: "70vh" }}>
        <h2 className="text-lg">Chuyển tiếp tin nhắn</h2>
        <div className="rounded-[8px] px-2.5 py-2 text-[12px] truncate" style={{ background: "var(--color-surface)", color: "var(--color-neutral-500)" }}>
          {content || (attachment ? "📎 Tệp đính kèm" : "")}
        </div>
        <input
          type="text"
          className="input"
          style={{ padding: "6px 10px", fontSize: 13 }}
          placeholder="Tìm phòng hoặc tên người…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: "45vh" }}>
          {loading ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
              Đang tải…
            </p>
          ) : (
            <>
              {filteredRooms.length > 0 && (
                <p className="text-[11px] font-bold tracking-[0.08em] px-1 pt-1" style={{ color: "var(--color-neutral-500)" }}>
                  PHÒNG HỌP
                </p>
              )}
              {filteredRooms.map((r) => {
                const key = `room-${r.id}`;
                const sent = sentTo.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={busyKey === key || sent}
                    onClick={() => sendToRoom(r)}
                    className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-left"
                    style={{ background: "var(--color-surface)" }}
                  >
                    <span aria-hidden>{r.icon}</span>
                    <span className="flex-1 truncate text-[13px] font-semibold">{r.name}</span>
                    <span className="flex-none text-[11px] font-bold" style={{ color: sent ? "var(--status-green)" : "var(--color-accent-700)" }}>
                      {sent ? "Đã gửi ✓" : busyKey === key ? "Đang gửi…" : "Gửi"}
                    </span>
                  </button>
                );
              })}
              {filteredPeers.length > 0 && (
                <p className="text-[11px] font-bold tracking-[0.08em] px-1 pt-2" style={{ color: "var(--color-neutral-500)" }}>
                  CHAT RIÊNG
                </p>
              )}
              {filteredPeers.map((p) => {
                const key = `peer-${p.id}`;
                const sent = sentTo.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={busyKey === key || sent}
                    onClick={() => sendToPeer(p)}
                    className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-left"
                    style={{ background: "var(--color-surface)" }}
                  >
                    <span
                      className="flex items-center justify-center rounded-full text-[11px] font-bold overflow-hidden flex-none"
                      style={{ width: 26, height: 26, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                    >
                      {p.display_name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate text-[13px] font-semibold">{p.display_name}</span>
                    <span className="flex-none text-[11px] font-bold" style={{ color: sent ? "var(--status-green)" : "var(--color-accent-700)" }}>
                      {sent ? "Đã gửi ✓" : busyKey === key ? "Đang gửi…" : "Gửi"}
                    </span>
                  </button>
                );
              })}
              {filteredRooms.length === 0 && filteredPeers.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                  Không tìm thấy kết quả.
                </p>
              )}
            </>
          )}
        </div>
        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
        <div className="flex items-center justify-end">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
            Xong
          </button>
        </div>
      </div>
    </Modal>
  );
}
