"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { useChatManager, useLiveProfiles } from "@/components/workspace/ChatManager";
import { DirectMessagesPanel } from "@/components/workspace/DirectMessagesPanel";
import type { ForwardableAttachment } from "@/components/workspace/ForwardMessageModal";

// Code-split: each of these only ever renders once its own trigger state
// flips true (opening a call, viewing an image, forwarding a message,
// switching into the food-order room) — a cold app launch shouldn't have
// to download and parse all four just to show the message list, which is
// the only thing actually on screen most of the time. `ssr: false` is fine
// here since none of them can render meaningfully without client state
// (a call already in progress, a clicked image, etc.) that doesn't exist
// on the server anyway.
const FoodOrderPanel = dynamic(() => import("@/components/workspace/FoodOrderPanel").then((m) => m.FoodOrderPanel), { ssr: false });
const VideoCallModal = dynamic(() => import("@/components/workspace/VideoCallModal").then((m) => m.VideoCallModal), { ssr: false });
const ImageLightbox = dynamic(() => import("@/components/workspace/ImageLightbox").then((m) => m.ImageLightbox), { ssr: false });
const ForwardMessageModal = dynamic(
  () => import("@/components/workspace/ForwardMessageModal").then((m) => m.ForwardMessageModal),
  { ssr: false },
);
import { useCallPresence } from "@/lib/useCallPresence";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { thumbnailUrl } from "@/lib/imageTransform";
import {
  addChannelMember,
  addReaction,
  createChannel,
  deleteChannel,
  getRoomSync,
  joinChannel,
  leaveChannel,
  listChannelMembers,
  listChannels,
  markChannelRead,
  markRoomSeen,
  recallMeetingMessage,
  removeChannelMember,
  removeReaction,
  searchMeetingMessages,
  sendMeetingMessage,
  setDmTabLabel,
  togglePinMessage,
  updateChannel,
} from "@/lib/actions/meetings";
import { translateMessage } from "@/lib/actions/translate";
import type {
  MeetingChannelPublic,
  MeetingChannelRead,
  MeetingMessage,
  MeetingReaction,
  MeetingSearchResult,
  Profile,
} from "@/lib/types";

const ROOM_ICONS = ["💬", "🎨", "📚", "🎬", "🧵", "🛠", "📣", "🎯"];

// A pseudo-room id for the "Riêng" (1:1) tab in the room list — not a real
// meeting_channels row, just a sentinel activeId value that swaps the main
// panel over to DirectMessagesPanel instead of a channel's messages.
const DM_TAB_ID = "__dm__";

// A per-room snapshot — see roomCacheRef in MeetingHub below.
type RoomSnapshot = {
  messages: MeetingMessage[];
  reactions: MeetingReaction[];
  reads: MeetingChannelRead[];
  pinnedMessages: MeetingMessage[];
};

// Persists roomCacheRef to localStorage so it survives a full app relaunch,
// not just switching rooms within one still-open tab — closing the iPad
// PWA and reopening it tears down the whole page (and every in-memory
// ref/state with it), so without this, "read one, come back later" always
// paid for a full reload no matter how recently the room was open.
const ROOM_CACHE_STORAGE_PREFIX = "funti-room-cache:";

function loadRoomSnapshotFromStorage(channelId: string): RoomSnapshot | null {
  try {
    const raw = localStorage.getItem(ROOM_CACHE_STORAGE_PREFIX + channelId);
    if (!raw) return null;
    return JSON.parse(raw) as RoomSnapshot;
  } catch {
    return null; // localStorage unavailable (private browsing) or corrupt entry — just skip it
  }
}

function saveRoomSnapshotToStorage(channelId: string, snapshot: RoomSnapshot) {
  try {
    localStorage.setItem(ROOM_CACHE_STORAGE_PREFIX + channelId, JSON.stringify(snapshot));
  } catch {
    // Unavailable, or quota exceeded — the room just won't have an instant
    // cold-open next time, same as if this feature didn't exist.
  }
}

const EMOJI_OPTIONS = [
  "😀", "😂", "😅", "😍", "😉", "😎", "🤔", "😢",
  "😭", "😡", "🥳", "😴", "😱", "🙌", "👀", "🤝",
  "👍", "👎", "👏", "🙏", "💪", "🔥", "✅", "❌",
  "🎉", "❤️", "💯", "😘", "🐶", "🐱",
];

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];

function formatTime(date: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function isSameCalendarDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// Zalo-style date divider between messages that land on different days —
// "Hôm nay"/"Hôm qua" for the two most recent, a full weekday + date
// otherwise so scrolling back through older history still reads clearly.
function formatDateDivider(date: string) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameCalendarDay(date, today.toISOString())) return "Hôm nay";
  if (isSameCalendarDay(date, yesterday.toISOString())) return "Hôm qua";
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function isImage(mime: string | null) {
  return !!mime && mime.startsWith("image/");
}

// Bolds the first occurrence of the search query in a result's snippet —
// good enough for a one-line preview, no need to highlight every hit.
function highlightMatch(content: string, query: string) {
  const q = query.trim();
  if (!q) return content;
  const idx = content.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return content;
  return (
    <>
      {content.slice(0, idx)}
      <mark style={{ background: "var(--color-accent-100)", color: "var(--color-accent-700)", fontWeight: 700 }}>
        {content.slice(idx, idx + q.length)}
      </mark>
      {content.slice(idx + q.length)}
    </>
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Renders message text with URLs auto-linked and any "@Display Name" that
// matches a real teammate highlighted — good enough without a rich-text
// editor or a real mention-notification pipeline.
function renderContent(text: string, namesPattern: string | null, mine: boolean) {
  const namesAlt = namesPattern ? `${namesPattern}|` : "";
  const pattern = new RegExp(`(https?://[^\\s]+|@(?:${namesAlt}all\\b))`, "g");
  return text.split(pattern).map((part, i) => {
    if (!part) return null;
    if (/^https?:\/\//.test(part)) {
      return (
        <span key={i} className="inline-flex items-center gap-0.5">
          <a
            href={part}
            target="_blank"
            rel="noreferrer"
            style={{ color: mine ? "#fff" : "var(--color-accent-700)", textDecoration: "underline" }}
          >
            {part}
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              navigator.clipboard?.writeText(part).catch(() => {});
            }}
            aria-label="Sao chép link"
            title="Sao chép link"
            style={{ fontSize: 11, opacity: mine ? 0.85 : 0.6, lineHeight: 1 }}
          >
            📋
          </button>
        </span>
      );
    }
    if (part.startsWith("@")) {
      const isAll = part === "@all";
      return (
        <strong
          key={i}
          className={isAll ? "px-1 rounded-[4px]" : undefined}
          style={{
            color: isAll ? "#fff" : mine ? "#ffe9d6" : "var(--color-accent-700)",
            background: isAll ? "var(--status-red)" : undefined,
          }}
        >
          {part}
        </strong>
      );
    }
    return part;
  });
}

function Avatar({ profile, size = 28 }: { profile: Pick<Profile, "display_name" | "avatar_url"> | undefined; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold flex-none overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.4, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
    >
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl(profile.avatar_url, Math.max(size * 2, 64))} alt="" className="w-full h-full object-cover" />
      ) : (
        (profile?.display_name ?? "?").charAt(0).toUpperCase()
      )}
    </span>
  );
}

function CreateRoomModal({
  onClose,
  onCreated,
  parentOptions,
  initialParentId,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  parentOptions: MeetingChannelPublic[];
  initialParentId?: string | null;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [locked, setLocked] = useState(false);
  const [icon, setIcon] = useState(ROOM_ICONS[0]);
  const [parentId, setParentId] = useState(initialParentId ?? "");
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
      const id = await createChannel(name, locked ? password : "", icon, parentId || null);
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
        <h2 className="text-lg">{initialParentId ? "Tạo phòng con" : "Tạo phòng mới"}</h2>

        {parentOptions.length > 0 && (
          <div className="field">
            <label htmlFor="room-parent">Thuộc phòng (tuỳ chọn)</label>
            <select id="room-parent" className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Không — phòng độc lập</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
            {parentId && (
              <p className="text-[11px] mt-1" style={{ color: "var(--color-neutral-500)" }}>
                Thành viên hiện tại của phòng đó sẽ tự động có mặt trong phòng con này.
              </p>
            )}
          </div>
        )}

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

// Director/PM-only: renames "Chung" (a real meeting_channels row, patched
// via updateChannel like any other room) and the "Riêng" tab (a hardcoded
// label with no row of its own, stored in workspace_room_labels instead —
// see setDmTabLabel).
function RoomLabelsEditor({
  onClose,
  generalChannelId,
  generalChannelName,
  dmTabLabel,
  onSaved,
}: {
  onClose: () => void;
  generalChannelId: string | null;
  generalChannelName: string;
  dmTabLabel: string;
  onSaved: (patch: { generalName?: string; dmTabLabel?: string }) => void;
}) {
  const [generalName, setGeneralName] = useState(generalChannelName);
  const [riengLabel, setRiengLabel] = useState(dmTabLabel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedGeneral = generalName.trim();
    const trimmedRieng = riengLabel.trim();
    if (!trimmedGeneral || !trimmedRieng) return;
    setSaving(true);
    setError(null);
    try {
      const patch: { generalName?: string; dmTabLabel?: string } = {};
      if (generalChannelId && trimmedGeneral !== generalChannelName) {
        await updateChannel(generalChannelId, { name: trimmedGeneral });
        patch.generalName = trimmedGeneral;
      }
      if (trimmedRieng !== dmTabLabel) {
        await setDmTabLabel(trimmedRieng);
        patch.dmTabLabel = trimmedRieng;
      }
      onSaved(patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={380}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2 className="text-lg">Đổi tên Chung / Riêng</h2>

        <div className="field">
          <label htmlFor="rooms-general-name">Tên phòng chung</label>
          <input
            id="rooms-general-name"
            className="input"
            value={generalName}
            onChange={(e) => setGeneralName(e.target.value.slice(0, 60))}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="rooms-dm-label">Tên tab nhắn riêng</label>
          <input
            id="rooms-dm-label"
            className="input"
            value={riengLabel}
            onChange={(e) => setRiengLabel(e.target.value.slice(0, 30))}
            required
          />
        </div>

        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-ghost" disabled={saving}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !generalName.trim() || !riengLabel.trim()}>
            {saving ? "Đang lưu…" : "Lưu"}
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

// A dropdown (not a centered modal) anchored under the 👥 button — every
// staff member is always listed, already-in-room people sorted to the top
// with a filled checkmark instead of disappearing, so picking someone gives
// immediate, visible confirmation without losing your place in the list.
function RoomInfoDropdown({
  channelId,
  channelName,
  hasPassword,
  isOwner,
  profiles,
  onClose,
  onUpdated,
  onMemberAdded,
  onMemberRemoved,
}: {
  channelId: string;
  channelName: string;
  hasPassword: boolean;
  isOwner: boolean;
  profiles: Profile[];
  onClose: () => void;
  onUpdated: (patch: { name?: string; has_password?: boolean }) => void;
  onMemberAdded: (profileId: string) => void;
  onMemberRemoved: (profileId: string) => void;
}) {
  const [memberIds, setMemberIds] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Swipe-left-to-reveal "Mời ra" (kick), like iOS Mail's swipe actions —
  // tracked as a per-row horizontal offset so only the row being dragged
  // moves, and Pointer Events (not touch-only) so this also works by
  // click-dragging with a mouse.
  const KICK_REVEAL_WIDTH = 84;
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startX: number; baseOffset: number } | null>(null);

  const [nameInput, setNameInput] = useState(channelName);
  const [passwordEnabled, setPasswordEnabled] = useState(hasPassword);
  const [currentHasPassword, setCurrentHasPassword] = useState(hasPassword);
  const [passwordInput, setPasswordInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      const patch: { name?: string; password?: string | null } = {};
      const trimmedName = nameInput.trim();
      if (trimmedName && trimmedName !== channelName) patch.name = trimmedName;
      if (!passwordEnabled && currentHasPassword) patch.password = null;
      else if (passwordEnabled && passwordInput.trim()) patch.password = passwordInput.trim();

      if (Object.keys(patch).length > 0) {
        await updateChannel(channelId, patch);
        onUpdated({ name: patch.name, has_password: passwordEnabled });
        setCurrentHasPassword(passwordEnabled);
        setPasswordInput("");
      }
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    listChannelMembers(channelId)
      .then((members) => !cancelled && setMemberIds(new Set(members.map((m) => m.id))))
      .catch(() => !cancelled && setMemberIds(new Set()));
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const q = search.trim().toLowerCase();
  const rows = profiles
    .filter((p) => q === "" || p.display_name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aIn = memberIds?.has(a.id) ?? false;
      const bIn = memberIds?.has(b.id) ?? false;
      if (aIn !== bIn) return aIn ? -1 : 1;
      return a.display_name.localeCompare(b.display_name);
    });

  async function add(profileId: string) {
    setAddingId(profileId);
    setError(null);
    try {
      await addChannelMember(channelId, profileId);
      setMemberIds((prev) => new Set(prev).add(profileId));
      onMemberAdded(profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setAddingId(null);
    }
  }

  async function removeMember(profileId: string) {
    setRemovingId(profileId);
    setError(null);
    try {
      await removeChannelMember(channelId, profileId);
      setMemberIds((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
      setSwipeOffsets((prev) => ({ ...prev, [profileId]: 0 }));
      onMemberRemoved(profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setRemovingId(null);
    }
  }

  function handleSwipeStart(e: React.PointerEvent, id: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id, startX: e.clientX, baseOffset: swipeOffsets[id] ?? 0 };
    setDraggingId(id);
  }

  function handleSwipeMove(e: React.PointerEvent, id: string) {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    const next = Math.min(0, Math.max(-KICK_REVEAL_WIDTH, drag.baseOffset + (e.clientX - drag.startX)));
    setSwipeOffsets((prev) => ({ ...prev, [id]: next }));
  }

  function handleSwipeEnd(id: string) {
    if (dragRef.current?.id !== id) return;
    dragRef.current = null;
    setDraggingId(null);
    setSwipeOffsets((prev) => ({ ...prev, [id]: (prev[id] ?? 0) < -KICK_REVEAL_WIDTH / 2 ? -KICK_REVEAL_WIDTH : 0 }));
  }

  return (
    <div
      ref={popoverRef}
      className="card elev-lg flex flex-col"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
        maxWidth: "90%",
        zIndex: 20,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
        overflow: "hidden",
      }}
    >
      <div className="flex items-center justify-between flex-none p-4 pb-0">
        <h3 className="text-sm font-bold">Thông tin phòng</h3>
        <button type="button" onClick={onClose} className="btn-icon flex-none" style={{ width: 26, height: 26, padding: 0 }} aria-label="Đóng">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
        {isOwner && (
          <form onSubmit={saveSettings} className="flex flex-col gap-2 pb-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
            <div className="field">
              <label htmlFor="room-edit-name" className="text-[11px]">
                Tên phòng
              </label>
              <input
                id="room-edit-name"
                className="input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value.slice(0, 60))}
                style={{ padding: "6px 10px", fontSize: 13 }}
              />
            </div>
            <label className="flex items-center gap-2 text-[12px] font-semibold cursor-pointer">
              <input type="checkbox" checked={passwordEnabled} onChange={(e) => setPasswordEnabled(e.target.checked)} />
              🔒 Đặt mật khẩu (phòng riêng tư)
            </label>
            {passwordEnabled && (
              <input
                className="input"
                type="text"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={currentHasPassword ? "Để trống nếu không đổi mật khẩu" : "Mật khẩu để tham gia phòng"}
                style={{ padding: "6px 10px", fontSize: 13 }}
              />
            )}
            {settingsError && (
              <p className="text-[12px] font-semibold" style={{ color: "var(--status-red)" }}>
                {settingsError}
              </p>
            )}
            <button type="submit" disabled={savingSettings} className="btn btn-secondary btn-sm">
              {savingSettings ? "Đang lưu…" : settingsSaved ? "✓ Đã lưu" : "Lưu thay đổi"}
            </button>
          </form>
        )}

        <h4 className="text-[12px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
          THÀNH VIÊN
        </h4>
        <input
          className="input flex-none"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm tên nhân viên…"
          style={{ padding: "6px 10px", fontSize: 13 }}
        />
        {error && (
          <p className="text-[12px] font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
        {memberIds === null ? (
          <p className="text-[12px] text-center py-3" style={{ color: "var(--color-neutral-500)" }}>
            Đang tải…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-center py-3" style={{ color: "var(--color-neutral-500)" }}>
            Không tìm thấy ai.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
          {rows.map((p) => {
            const isMember = memberIds.has(p.id);
            const canKick = isMember && isOwner;
            const offset = swipeOffsets[p.id] ?? 0;
            const row = (
              <div
                className="flex items-center gap-2 px-1.5 py-1.5 rounded-[8px]"
                style={{
                  background: "var(--color-surface)",
                  // Without an explicit position, this row is a static
                  // element and the "Mời ra" button behind it — despite
                  // coming first in the DOM — is `position: absolute`, so it
                  // paints on top regardless of swipe state. Making the row
                  // itself positioned (and later in the DOM) puts it back on
                  // top at rest, fully covering the button until a swipe
                  // physically moves the row's box out of the way.
                  position: canKick ? "relative" : undefined,
                  transform: canKick && offset !== 0 ? `translateX(${offset}px)` : undefined,
                  transition: draggingId === p.id ? "none" : "transform 0.2s ease",
                  touchAction: canKick ? "pan-y" : undefined,
                  cursor: canKick ? "grab" : undefined,
                }}
                onPointerDown={canKick ? (e) => handleSwipeStart(e, p.id) : undefined}
                onPointerMove={canKick ? (e) => handleSwipeMove(e, p.id) : undefined}
                onPointerUp={canKick ? () => handleSwipeEnd(p.id) : undefined}
                onPointerCancel={canKick ? () => handleSwipeEnd(p.id) : undefined}
                onClick={canKick && offset !== 0 ? () => setSwipeOffsets((prev) => ({ ...prev, [p.id]: 0 })) : undefined}
              >
                <span
                  className="flex items-center justify-center rounded-full text-[11px] font-bold overflow-hidden flex-none"
                  style={{ width: 28, height: 28, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                >
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnailUrl(p.avatar_url, 56)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    p.display_name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold truncate">{p.display_name}</span>
                  <span className="block text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                    {p.role ?? ""}
                  </span>
                </span>
                {isMember ? (
                  <span className="flex items-center gap-1 flex-none text-[11px] font-bold" style={{ color: "var(--status-green)" }}>
                    <span aria-hidden>✓</span> Đã vào phòng
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => add(p.id)}
                    disabled={addingId === p.id}
                    className="btn btn-secondary btn-sm flex-none"
                    style={{ padding: "4px 10px", fontSize: 11 }}
                  >
                    {addingId === p.id ? "Đang thêm…" : "+ Thêm"}
                  </button>
                )}
              </div>
            );

            if (!canKick) return <div key={p.id}>{row}</div>;

            return (
              <div key={p.id} className="relative overflow-hidden rounded-[8px]">
                <div className="absolute inset-y-0 right-0 flex items-stretch">
                  <button
                    type="button"
                    onClick={() => removeMember(p.id)}
                    disabled={removingId === p.id}
                    className="text-[12px] font-bold text-white"
                    style={{ width: KICK_REVEAL_WIDTH, background: "var(--status-red)", border: "none" }}
                  >
                    {removingId === p.id ? "…" : "Mời ra"}
                  </button>
                </div>
                {row}
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}

export function MeetingHub({
  currentUser,
  profiles: profilesProp,
  initialChannels,
  initialDmTabLabel,
}: {
  currentUser: { id: string; display_name: string };
  profiles: Profile[];
  initialChannels: MeetingChannelPublic[];
  initialDmTabLabel: string;
}) {
  const { setActiveMeetingChannel, unreadCounts: dmUnreadCounts, meetingUnreadCounts } = useChatManager();
  // Patched with any live profile edits (name/avatar) a colleague has made
  // since this page loaded — see useLiveProfiles.
  const profiles = useLiveProfiles(profilesProp);
  const [channels, setChannels] = useState(initialChannels);
  const [dmTabLabel, setDmTabLabelState] = useState(initialDmTabLabel);
  const [showLabelsEditor, setShowLabelsEditor] = useState(false);
  const myProfile = profiles.find((p) => p.id === currentUser.id);
  const isDirectorOrPm = myProfile?.access_role === "director" || myProfile?.role === "Project Manager";
  const [activeId, setActiveId] = useState<string | null>(
    initialChannels.find((c) => c.is_general)?.id ?? initialChannels[0]?.id ?? null,
  );
  // Deep-linking from a push notification click: sw.js sends the browser to
  // /workspace/hop?room=<id> or ?dm=<peerId>, so a click goes straight to
  // the room/conversation instead of just opening the workspace generically
  // to whatever room was open. This has to happen in an effect, not a
  // useState lazy initializer that reads window.location directly — the
  // server has no URL to read, so it always renders the default room, and a
  // lazy initializer that behaves differently on the client's first render
  // than what the server sent is exactly what causes a hydration mismatch.
  // Reading it post-mount instead means the first client render still
  // matches the server, and this effect nudges it over right after.
  const [initialDmPeerId, setInitialDmPeerId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dm = params.get("dm");
    const room = params.get("room");
    if (!dm && !room) return;
    // set-state-in-effect normally flags this as a smell because it usually
    // means state is being needlessly mirrored from other React state — but
    // here it's genuinely synchronizing with an external system (the URL a
    // notification click landed on), which has no server-side equivalent to
    // read during the initial render. It runs once, not on a loop.
    if (dm) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitialDmPeerId(dm);
      setActiveId(DM_TAB_ID);
    } else if (room && initialChannels.some((c) => c.id === room)) {
      setActiveId(room);
    }
    // Deliberately only runs once, off the URL the notification click
    // landed on — not meant to react to later in-app room switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The mount-only effect above misses every notification clicked *after*
  // this page was already open: sw.js still focuses the tab and posts the
  // same {type: "notification-click", url} message (see PushSetup.tsx), but
  // a same-route query-string change doesn't remount this component, so
  // that first effect never re-runs — the click would silently do nothing.
  // Listening for the message directly here, on top of PushSetup's own
  // router.push (which only keeps the address bar in sync), is what
  // actually switches the open conversation on a click that lands while
  // already sitting on /workspace/hop.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "notification-click" || typeof event.data.url !== "string") return;
      const params = new URL(event.data.url, window.location.origin).searchParams;
      const dm = params.get("dm");
      const room = params.get("room");
      if (dm) {
        setInitialDmPeerId(dm);
        setActiveId(DM_TAB_ID);
      } else if (room && initialChannels.some((c) => c.id === room)) {
        setActiveId(room);
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [initialChannels]);

  // Someone else adding this user to a room (an invite) or this user joining
  // a public room from a different device/tab both write a
  // meeting_channel_members row for them — without watching that, the new
  // room only ever showed up after a full page reload, since `channels`
  // above otherwise only ever updates in response to an action taken from
  // *this* tab (see handleCreated/handleJoined/handleLeave etc.).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`channel-memberships-${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_channel_members", filter: `profile_id=eq.${currentUser.id}` },
        (payload) => {
          const wasRemoved = payload.eventType === "DELETE";
          const removedChannelId = wasRemoved ? (payload.old as { channel_id?: string }).channel_id : null;
          listChannels()
            .then((fresh) => {
              setChannels(fresh);
              // Someone removed me (or I left from another device) while I
              // was actively looking at that exact room — nudge me back to
              // "Chung" instead of leaving the composer/message list mounted
              // on a room I'm no longer a member of.
              if (wasRemoved && removedChannelId && removedChannelId === activeIdRef.current) {
                selectChannel(fresh.find((c) => c.is_general)?.id ?? null);
              }
            })
            .catch(() => {});
        },
      )
      // A rename or password change from another tab/teammate — can't filter
      // this to "channels I'm a member of" at the subscription level (realtime
      // filters are plain column equality, not a membership subquery), so it
      // takes every room's UPDATE and just no-ops for ids not in `channels`.
      // Renames are rare enough that this is cheap.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meeting_channels" }, (payload) => {
        const row = payload.new as { id: string; name: string; icon: string; password_hash: string | null };
        refreshChannel(row.id, { name: row.name, icon: row.icon, has_password: !!row.password_hash });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // selectChannel is a plain (non-memoized) function redeclared every
    // render — including it would tear down and resubscribe this socket on
    // every render instead of just once per user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [reactions, setReactions] = useState<MeetingReaction[]>([]);
  const [reads, setReads] = useState<MeetingChannelRead[]>([]);
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Temp (client-generated) ids currently in flight or that failed — drives
  // the "Đang gửi…" / "Gửi lỗi" footer on an optimistic bubble. See
  // handleSend/attemptSend below for why messages appear instantly instead
  // of waiting on the server round-trip.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const pendingPayloadsRef = useRef<Map<string, { content: string; file: File | null; replyId: string | null }>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  // Top-level rooms only (a sub-room can't itself have sub-rooms) that I'm
  // already in, since I'd need to be a member to see/nest under one anyway.
  const nestableRooms = useMemo(
    () => channels.filter((c) => c.joined && !c.is_general && !c.parent_channel_id),
    [channels],
  );
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(new Set());
  const [showBrowse, setShowBrowse] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [roomMembers, setRoomMembers] = useState<Profile[]>([]);
  // The room list is a persistent column at sm+, but a full-screen overlay
  // on phones (no room for it beside the chat panel) — toggled from a
  // hamburger button in the chat panel's own header.
  const [showRoomListMobile, setShowRoomListMobile] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  // Reply/translate/forward/pin/recall collapse behind a single "⋯" so the
  // hover/touch action row reads as two icons (react, more) instead of a
  // long strip of five or six — the translate button tipped it over into
  // genuinely cluttered.
  const [moreMenuFor, setMoreMenuFor] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MeetingMessage | null>(null);
  // Per-message translate-on-demand — cached by message id so toggling a
  // translation back on doesn't re-hit the (free, unofficial) endpoint.
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [shownTranslationIds, setShownTranslationIds] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MeetingSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [mediaTab, setMediaTab] = useState<"images" | "links" | "files">("images");
  const [mediaSearch, setMediaSearch] = useState("");
  const [showPinned, setShowPinned] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<MeetingMessage[]>([]);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; filename: string | null } | null>(null);
  // Shows a floating "jump to latest" button once the reader has scrolled
  // far enough from the bottom that the auto-stick-to-bottom behavior
  // (stickToBottomIfNear) won't kick back in on its own — a manual escape
  // hatch for whenever the room lands mid-conversation instead of at the
  // newest message.
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  // `${messageId}:${emoji}` of the reaction pill currently hovered — drives a
  // bigger, readable "who reacted" popover instead of the tiny native title
  // tooltip staff found hard to read.
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState<{ content: string; attachment: ForwardableAttachment } | null>(null);
  // Set when a search result is picked — the scroll-into-view effect below
  // watches for this element to actually exist (it may not yet, if we just
  // switched rooms and that room's messages are still loading).
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Which room the bottom-scroll effect below last handled — lets it tell
  // "just switched rooms, always snap to bottom" apart from "same room,
  // only snap if already near the bottom" (see that effect for why).
  const scrolledRoomIdRef = useRef<string | null>(null);
  // Holds a room switch "stuck to bottom" past the single triggering render
  // — an attachment image with no reserved height can finish loading a full
  // second or more after the switch, and that onLoad call (force=false)
  // needs to still win during this window instead of only re-snapping when
  // already within 150px, or the view is left sitting above the true bottom.
  const stickyUntilRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  // Latest messages array, read (not reacted to) from inside resync() below —
  // it has to stay out of resync's own dependency array (see there) so a
  // new message arriving doesn't tear down and recreate the realtime
  // channel subscription on every single message.
  const messagesRef = useRef<MeetingMessage[]>([]);
  // Same idea as messagesRef, for the reactions delta-fetch in resync().
  const reactionsRef = useRef<MeetingReaction[]>([]);
  // Which room resync() last actually fetched — lets it tell "just switched
  // rooms, need the full history" apart from "same room, only catching up
  // on what was missed" without that also being a reactive dependency.
  const lastSyncedChannelIdRef = useRef<string | null>(null);
  // Last-known snapshot per room, kept after switching away — switching
  // back used to always show a blank/stale list for a full network
  // round-trip (getMeetingMessages + getReactionsSince + getChannelReads,
  // every single time, even for a room viewed seconds ago). resync() now
  // restores this instantly on a cache hit and only fetches the delta
  // since the snapshot, instead of the room's full history again. Seeded
  // lazily from localStorage per room (see loadRoomSnapshotFromStorage) the
  // first time each room is looked up here, so a cold app relaunch gets the
  // same instant-open benefit as switching rooms within one still-open tab.
  const roomCacheRef = useRef<Map<string, RoomSnapshot>>(new Map());
  const lastMarkedReadIdRef = useRef<string | null>(null);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const callRingAudioRef = useRef<HTMLAudioElement | null>(null);
  // On phone there's no Ctrl+V and no room to spare — the hint text (and
  // "gõ @ để nhắc ai đó") is desktop-only guidance, so mobile gets a blank
  // placeholder instead of a truncated, half-useful version of it.
  const isMobile = useIsMobileViewport();

  // A real thumbnail of the pending image beats a filename chip — lets
  // people confirm it's the right screenshot before sending. Computed
  // during render (not in an effect) since it's a pure derivation of
  // pendingFile; the effect below only ever revokes it, never sets state.
  const pendingPreviewUrl = useMemo(() => {
    if (!pendingFile || !isImage(pendingFile.type)) return null;
    return URL.createObjectURL(pendingFile);
  }, [pendingFile]);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  useEffect(() => {
    notificationAudioRef.current = new Audio("/sounds/dm-message.mp3");
    const ring = new Audio("/sounds/call-ring.mp3");
    ring.loop = true;
    callRingAudioRef.current = ring;
  }, []);

  // Tells the global tab-badge tracker which room is open right now, so it
  // doesn't count messages here as "unread" while the user is looking at
  // them — and clears on unmount so leaving /workspace/hop entirely doesn't
  // leave a room stuck marked "active" forever.
  useEffect(() => {
    setActiveMeetingChannel(activeId === DM_TAB_ID ? null : activeId);
    return () => setActiveMeetingChannel(null);
  }, [activeId, setActiveMeetingChannel]);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const joinedRooms = useMemo(() => channels.filter((c) => c.joined), [channels]);
  // Top-level rooms render in the list as usual; sub-rooms are grouped under
  // their parent instead, shown indented and only while that parent is
  // expanded — same "folder" pattern as the workspace's other tree views.
  const topLevelJoinedRooms = useMemo(() => joinedRooms.filter((c) => !c.parent_channel_id), [joinedRooms]);
  // "Chung" (with "Riêng" right under it) renders in its own "TRÒ CHUYỆN"
  // section above a divider, separate from the custom rooms under "PHÒNG
  // HỌP" below it — Chung can't have sub-rooms (see nestableRooms), so it
  // doesn't need the expand/children machinery the rooms below it do.
  const generalRoom = useMemo(() => topLevelJoinedRooms.find((c) => c.is_general) ?? null, [topLevelJoinedRooms]);
  // Rendered in its own row under TRÒ CHUYỆN, right below "Riêng" — not
  // mixed into the ordinary PHÒNG HỌP list below the divider.
  const foodRoom = useMemo(() => topLevelJoinedRooms.find((c) => c.is_food_room) ?? null, [topLevelJoinedRooms]);
  const customTopLevelRooms = useMemo(
    () => topLevelJoinedRooms.filter((c) => !c.is_general && !c.is_food_room),
    [topLevelJoinedRooms],
  );
  const childRoomsByParent = useMemo(() => {
    const map = new Map<string, MeetingChannelPublic[]>();
    for (const c of joinedRooms) {
      if (!c.parent_channel_id) continue;
      const list = map.get(c.parent_channel_id);
      if (list) list.push(c);
      else map.set(c.parent_channel_id, [c]);
    }
    return map;
  }, [joinedRooms]);
  const dmTotalUnread = useMemo(() => Object.values(dmUnreadCounts).reduce((sum, n) => sum + n, 0), [dmUnreadCounts]);
  const browsableRooms = useMemo(() => channels.filter((c) => !c.joined), [channels]);
  const activeChannel = channels.find((c) => c.id === activeId) ?? null;
  // Only custom rooms track explicit membership rows — "Chung" and "Đặt đồ
  // ăn" are open to every staff member implicitly, so there's no meaningful
  // roster to show for either.
  const activeRoomIdForMembers =
    activeChannel && !activeChannel.is_general && !activeChannel.is_food_room ? activeChannel.id : null;
  // Watches (without joining) whether anyone's currently on a call in this
  // room — the banner below is how a member other than the one who started
  // it finds out there's a call to join at all.
  const callRoomKey = activeChannel ? `hop-${activeChannel.id}` : null;
  const activeCallParticipants = useCallPresence(callRoomKey);
  const othersOnCall = activeCallParticipants.filter((p) => p.id !== currentUser.id);

  // "Từ chối" hides the banner (and stops the ring) for this specific call
  // without ending it for anyone else — cleared automatically the moment a
  // fresh call starts (0 → >0 transition) so declining one call doesn't
  // silently swallow the next one too.
  const [dismissedCallKey, setDismissedCallKey] = useState<string | null>(null);
  const prevOthersOnCallCountRef = useRef(0);
  useEffect(() => {
    if (prevOthersOnCallCountRef.current === 0 && othersOnCall.length > 0) {
      setDismissedCallKey(null);
    }
    prevOthersOnCallCountRef.current = othersOnCall.length;
  }, [othersOnCall.length]);
  const showCallBanner = othersOnCall.length > 0 && !showVideoCall && dismissedCallKey !== callRoomKey;

  // Rings on loop for as long as someone else is on a call in this room and
  // I haven't joined or declined it — stops the moment I join, decline, the
  // caller hangs up, or I switch to a different room (activeCallParticipants
  // tracks the newly active room only).
  useEffect(() => {
    const audio = callRingAudioRef.current;
    if (!audio) return;
    if (showCallBanner) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [showCallBanner]);

  useEffect(() => {
    if (!activeRoomIdForMembers) return;
    let cancelled = false;
    listChannelMembers(activeRoomIdForMembers)
      .then((members) => !cancelled && setRoomMembers(members))
      .catch(() => !cancelled && setRoomMembers([]));
    return () => {
      cancelled = true;
    };
  }, [activeRoomIdForMembers]);

  // Someone else joining/being added to or leaving/being removed from this
  // exact room while its roster is on screen — a plain refetch rather than
  // patching in place since a membership row alone doesn't carry the joined
  // profile's name/avatar the roster needs to render.
  useEffect(() => {
    if (!activeRoomIdForMembers) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`channel-roster-${activeRoomIdForMembers}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_channel_members", filter: `channel_id=eq.${activeRoomIdForMembers}` },
        () => {
          listChannelMembers(activeRoomIdForMembers)
            .then((members) => setRoomMembers(members))
            .catch(() => {});
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRoomIdForMembers]);

  const displayedRoomMembers = activeRoomIdForMembers ? roomMembers : [];

  const namesPattern = useMemo(() => {
    const names = profiles
      .map((p) => p.display_name)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);
    return names.length > 0 ? names.join("|") : null;
  }, [profiles]);

  // Facebook-style read receipts: each teammate's little avatar trails
  // under whichever message is the last one *they've* seen — which can be
  // an older message if they're behind, not necessarily the newest one.
  const seenByMessageId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of reads) {
      if (r.profile_id === currentUser.id || !r.last_read_message_id) continue;
      const list = map.get(r.last_read_message_id);
      if (list) list.push(r.profile_id);
      else map.set(r.last_read_message_id, [r.profile_id]);
    }
    return map;
  }, [reads, currentUser.id]);

  // "Các tệp hình ảnh/link/file" panel — derived straight from the messages
  // already loaded for this room (up to the 300 getMeetingMessages fetches),
  // no extra round trip needed since reactions/seenBy already work the same
  // way.
  const channelMedia = useMemo(() => {
    const images: MeetingMessage[] = [];
    const files: MeetingMessage[] = [];
    const links: { url: string; message: MeetingMessage }[] = [];
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    for (const m of messages) {
      if (m.is_recalled) continue;
      if (m.attachment_url) {
        if (isImage(m.attachment_mime)) images.push(m);
        else files.push(m);
      }
      if (m.content) {
        const found = m.content.match(urlPattern);
        if (found) for (const url of found) links.push({ url, message: m });
      }
    }
    return { images, files, links };
  }, [messages]);

  const mentionMatch = /(^|\s)@([\p{L}0-9]*)$/u.exec(text);
  const mentionQuery = mentionMatch ? mentionMatch[2] : null;
  // "@all" pings everyone in the room the same way @-ing a real teammate
  // does — offered in the same dropdown whenever what's typed so far could
  // still lead to it.
  const showAllMentionOption = mentionQuery !== null && "all".startsWith(mentionQuery.toLowerCase());
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return profiles
      .filter((p) => p.display_name.toLowerCase().includes(q))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [mentionQuery, profiles]);

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((m) => m.id));
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    reactionsRef.current = reactions;
  }, [reactions]);

  // Keeps roomCacheRef current for whichever room is open, so leaving it
  // (switching to another room, or to the DM tab) always freezes an
  // up-to-date snapshot for next time.
  //
  // On the render right after activeId changes, `messages`/etc. still hold
  // the *previous* room's data (they only catch up once resync()'s own
  // setState calls land) — writing that stale snapshot under the *new*
  // room's key here would then have resync() itself read its own
  // just-written garbage as a "cache hit" for a room it's never actually
  // fetched, since this effect is declared (and so runs) before the
  // resync-triggering effect below in the same commit. Guarding on
  // lastSyncedChannelIdRef — only set to activeId by resync() itself once
  // it has decided how to populate this room's state — closes that window:
  // it's still the *previous* room's id on that first stale-data render, so
  // the write is correctly skipped until resync() has actually run for the
  // new room and this effect fires again with data that genuinely matches it.
  useEffect(() => {
    if (!activeId || activeId === DM_TAB_ID || activeId !== lastSyncedChannelIdRef.current) return;
    const snapshot: RoomSnapshot = { messages, reactions, reads, pinnedMessages };
    roomCacheRef.current.set(activeId, snapshot);
    // Also mirrored to localStorage (see its own comment on roomCacheRef)
    // so this survives closing the app entirely, not just switching rooms.
    saveRoomSnapshotToStorage(activeId, snapshot);
  }, [activeId, messages, reactions, reads, pinnedMessages]);

  useEffect(() => {
    if (!showEmojiPicker && !reactionPickerFor && !moreMenuFor) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
        setReactionPickerFor(null);
        setMoreMenuFor(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker, reactionPickerFor, moreMenuFor]);

  // Reconciles a server-confirmed row against the optimistic placeholder
  // that's standing in for it. Matches by tempId when the caller knows it
  // (our own send resolving); otherwise (the realtime INSERT echoing our
  // own message back) falls back to matching the oldest still-pending
  // temp bubble with the same content, so the rare case of the realtime
  // event arriving before our own await does doesn't leave a duplicate.
  const mergeServerMessage = useCallback(
    (prev: MeetingMessage[], confirmed: MeetingMessage, tempId?: string) => {
      if (prev.some((m) => m.id === confirmed.id)) return prev;
      if (tempId) {
        const idx = prev.findIndex((m) => m.id === tempId);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = confirmed;
          return next;
        }
      }
      if (confirmed.sender_id === currentUser.id) {
        const idx = prev.findIndex((m) => m.id.startsWith("temp-") && m.content === confirmed.content);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = confirmed;
          return next;
        }
      }
      return [...prev, confirmed];
    },
    [currentUser.id],
  );

  // Catches up the active channel after the realtime subscription below may
  // have silently missed an event while the websocket was disconnected
  // (phone screen locked, tab backgrounded, a network blip...) — that used
  // to show up to staff as a push notification arriving (for a new message,
  // or someone reacting) but nothing actually changing on screen until a
  // manual reload. Called on room switch, on tab focus/visibility, and
  // whenever the channel below (re)subscribes.
  //
  // On an actual room switch, a cache hit (roomCacheRef — see there) shows
  // the snapshot from last time instantly and only fetches what changed
  // since; a genuinely first-ever visit still loads the full history. Room
  // switches used to always pay for that full history again, even when
  // switching straight back to a room viewed seconds earlier.
  // Everywhere else — tab refocus, a reconnect while still looking at the
  // same room — messages and reactions each fetch only what's newer than
  // the newest one already held (independently of each other, since a
  // reaction can land on a message that isn't new) and get appended,
  // instead of re-fetching and replacing everything every time. Staff
  // alt-tabbing all day were paying for a full reload (and a full re-render
  // of the message list) on every single tab switch even when nothing had
  // changed.
  const resync = useCallback(() => {
    const id = activeId;
    if (!id || id === DM_TAB_ID) return;
    const isNewRoom = lastSyncedChannelIdRef.current !== id;
    lastSyncedChannelIdRef.current = id;

    // In-memory first (this tab's own recent visits), falling back to
    // localStorage (a previous session/app launch) — and hydrating the
    // in-memory map from it, so this only ever hits localStorage once per
    // room per page load, not on every switch back to it.
    let cached = isNewRoom ? roomCacheRef.current.get(id) : undefined;
    if (isNewRoom && !cached) {
      const stored = loadRoomSnapshotFromStorage(id);
      if (stored) {
        cached = stored;
        roomCacheRef.current.set(id, stored);
      }
    }
    if (cached) {
      // Paint the last-known state immediately — no network wait — before
      // kicking off the delta fetch below.
      setMessages(cached.messages);
      setReactions(cached.reactions);
      setReads(cached.reads);
      setPinnedMessages(cached.pinnedMessages);
    }
    // A cache hit only needs catching up, same as the same-room case below
    // — a full fetch is only for a room with no snapshot at all yet.
    const needsFullFetch = isNewRoom && !cached;

    // Reduce rather than "just read the last element" — a realtime INSERT
    // can append out of arrival order, so the newest created_at isn't
    // guaranteed to be the last item in either array.
    const latestOf = (timestamps: string[]) =>
      timestamps.length === 0 ? undefined : timestamps.reduce((max, t) => (t > max ? t : max));

    // messagesRef/reactionsRef still hold the *previous* room's arrays at
    // this exact point (they only sync after this render commits) — fine
    // for the same-room case (that's genuinely what they hold), but a new
    // room's own baseline has to come from its cache snapshot instead.
    const baseMessages = cached ? cached.messages : messagesRef.current;
    const baseReactions = cached ? cached.reactions : reactionsRef.current;

    const messagesAfter = needsFullFetch ? undefined : latestOf(baseMessages.map((m) => m.created_at));
    const reactionsAfter = needsFullFetch ? undefined : latestOf(baseReactions.map((r) => r.created_at));

    // One combined round trip (see getRoomSync's own comment) instead of
    // four separate ones — each of those paid for its own auth round trip
    // to Supabase on top of its query, so four client calls meant eight
    // network hops for a single room switch.
    getRoomSync(id, { messagesAfter, reactionsAfter })
      .then(({ messages: msgs, reactions: rx, reads: rd, pinnedMessages: pinned }) => {
        if (activeIdRef.current !== id) return;
        if (needsFullFetch) {
          setMessages(msgs);
        } else if (msgs.length > 0) {
          setMessages((prev) => msgs.reduce((acc, m) => mergeServerMessage(acc, m), prev));
        }
        if (needsFullFetch) {
          setReactions(rx);
        } else if (rx.length > 0) {
          setReactions((prev) => {
            const key = (r: MeetingReaction) => `${r.message_id}:${r.profile_id}:${r.emoji}`;
            const seen = new Set(prev.map(key));
            const fresh = rx.filter((r) => !seen.has(key(r)));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
        setReads(rd);
        // togglePin() above already updates this optimistically for changes
        // made from this tab — this just keeps it in sync with everyone
        // else's, same as messages/reactions above.
        setPinnedMessages(pinned);
      })
      .catch(() => {
        if (needsFullFetch && activeIdRef.current === id) {
          setMessages([]);
          setReactions([]);
        }
      });
  }, [activeId, mergeServerMessage]);

  useEffect(() => {
    lastMarkedReadIdRef.current = null;
    resync();
  }, [resync]);

  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState === "visible") resync();
    }
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", resync);
    };
  }, [resync]);

  // Mark the newest message in the currently-open channel as "seen by me" —
  // fires again whenever a fresh message arrives while the channel stays
  // open, same as Messenger updating your read position live. No local
  // state to update here: the "seen by" row under a message only ever
  // shows other people, never yourself, so this is pure fire-and-forget.
  useEffect(() => {
    if (!activeId || activeId === DM_TAB_ID || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMarkedReadIdRef.current === lastMessage.id) return;
    lastMarkedReadIdRef.current = lastMessage.id;
    markChannelRead(activeId, lastMessage.id).catch(() => {});
  }, [activeId, messages]);

  useEffect(() => {
    if (!activeId || activeId === DM_TAB_ID) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`meeting-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_messages", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const row = payload.new as MeetingMessage;
          if (row.sender_id !== currentUser.id) {
            const audio = notificationAudioRef.current;
            if (audio) {
              audio.currentTime = 0;
              audio.play().catch(() => {});
            }
          }
          setMessages((prev) => mergeServerMessage(prev, row));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "meeting_messages" },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        },
      )
      // Recall ("Thu hồi") and pin/unpin are both plain UPDATEs on this row
      // — without this, only the person who recalled/pinned a message ever
      // saw it change; everyone else's screen stayed on the stale version
      // until they reloaded or switched rooms.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meeting_messages", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const row = payload.new as MeetingMessage;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
          setPinnedMessages((prev) => {
            if (row.pinned_at) {
              return prev.some((p) => p.id === row.id)
                ? prev.map((p) => (p.id === row.id ? row : p))
                : [row, ...prev];
            }
            return prev.filter((p) => p.id !== row.id);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_message_reactions" },
        (payload) => {
          const row = payload.new as MeetingReaction;
          if (!messageIdsRef.current.has(row.message_id)) return;
          setReactions((prev) =>
            prev.some((r) => r.message_id === row.message_id && r.profile_id === row.profile_id && r.emoji === row.emoji)
              ? prev
              : [...prev, row],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "meeting_message_reactions" },
        (payload) => {
          const old = payload.old as { message_id: string; profile_id: string; emoji: string };
          setReactions((prev) =>
            prev.filter((r) => !(r.message_id === old.message_id && r.profile_id === old.profile_id && r.emoji === old.emoji)),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_channel_reads", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const row = payload.new as MeetingChannelRead;
          setReads((prev) => [...prev.filter((r) => r.profile_id !== row.profile_id), row]);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meeting_channel_reads", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const row = payload.new as MeetingChannelRead;
          setReads((prev) => [...prev.filter((r) => r.profile_id !== row.profile_id), row]);
        },
      )
      // Fires with "SUBSCRIBED" both on the initial connect and after any
      // reconnect — resyncing here is what catches up on messages that
      // arrived during a drop, since Realtime doesn't replay missed events.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") resync();
      });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [activeId, currentUser.id, resync, mergeServerMessage]);

  // Shared by the effect below and each message image's onLoad — an
  // attachment thumbnail has no reserved width/height (just a max-size
  // cap), so the browser doesn't know its real height until the image
  // data actually arrives over the network, which can easily land well
  // after messages/reactions/reads have all already settled and React has
  // stopped re-running effects. That late layout shift was the remaining
  // way the view ended up sitting short of the true bottom (Chung has a
  // lot of screenshots in its history) even after accounting for reactions
  // and read receipts.
  const stickToBottomIfNear = useCallback((force: boolean) => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (force || Date.now() < stickyUntilRef.current || distanceFromBottom < 150) {
      el.scrollTo({ top: el.scrollHeight });
      setShowJumpToBottom(false);
    } else {
      setShowJumpToBottom(distanceFromBottom > 400);
    }
  }, []);

  // Fires on every manual scroll of the message list — catches the reader
  // scrolling themselves away from the bottom, which the effect-driven
  // stickToBottomIfNear calls (message/reaction updates) don't see on their
  // own since nothing about the data changed.
  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpToBottom(distanceFromBottom > 400);
  }, []);

  // Reactions and "seen by" read receipts now load independently of
  // messages (see resync()) and can settle a beat after the message list
  // itself renders — each adds a little height (a reaction pill, an avatar
  // row under the last message), so scrolling to bottom only when
  // messages.length changed left the view sitting just short of the true
  // bottom once those finished loading, looking "stuck halfway" instead of
  // flush against the composer.
  //
  // Re-checks on every relevant update instead: always snaps to bottom
  // right after switching rooms (scrolledRoomIdRef changing), and otherwise
  // only re-snaps if the view was already within a small margin of the
  // bottom — so a reaction landing on an old message while someone's
  // scrolled up reading history doesn't yank them back down.
  useEffect(() => {
    const isRoomSwitch = scrolledRoomIdRef.current !== activeId;
    if (isRoomSwitch) stickyUntilRef.current = Date.now() + 3000;
    stickToBottomIfNear(isRoomSwitch);
    // Only marks the switch as handled once there's actual content to have
    // scrolled to — the very first run after switching rooms fires with an
    // still-empty (or stale, previous room's) list before the real fetch
    // resolves, and consuming the flag there would let that render's
    // near-empty scrollHeight fool the *next* run (the real content
    // arriving a beat later) into thinking it wasn't a fresh room anymore.
    if (messages.length > 0) {
      scrolledRoomIdRef.current = activeId;
    }
  }, [activeId, messages, reactions, reads, stickToBottomIfNear]);

  // Jumps to a picked search result once its message actually exists in the
  // DOM — runs again every time `messages` changes, which covers having
  // just switched rooms and still waiting on that room's fetch to resolve.
  // Declared after the scroll-to-bottom effect above so it wins when both
  // fire from the same messages update (switching into a room to jump to
  // a hit there triggers both).
  useEffect(() => {
    if (!scrollToMessageId) return;
    const el = document.getElementById(`meeting-msg-${scrollToMessageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("fk-flash-highlight");
    const flashTimer = setTimeout(() => el.classList.remove("fk-flash-highlight"), 1600);
    // Deferred rather than called synchronously in the effect body — this
    // clears the target once handled, not a value derivable during render.
    const raf = requestAnimationFrame(() => setScrollToMessageId(null));
    return () => {
      clearTimeout(flashTimer);
      cancelAnimationFrame(raf);
    };
  }, [messages, scrollToMessageId]);

  // Debounced live search across every room the user is in. Doesn't bother
  // resetting searchResults/searching when the query gets too short — the
  // render below already hides stale results behind the same length check.
  useEffect(() => {
    if (!showSearch || searchQuery.trim().length < 2) return;
    const handle = setTimeout(() => {
      searchMeetingMessages(searchQuery)
        .then((results) => setSearchResults(results))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [showSearch, searchQuery]);

  function pickSearchResult(result: MeetingSearchResult) {
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setShowRoomListMobile(false);
    setScrollToMessageId(result.id);
    if (result.channel_id !== activeId) selectChannel(result.channel_id);
  }

  function refreshChannel(id: string, patch: Partial<MeetingChannelPublic>) {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  // A reply-in-progress only makes sense in the channel it was started in.
  function selectChannel(id: string | null) {
    setReplyingTo(null);
    setActiveId(id);
    setShowRoomListMobile(false);

    // Opening a room you were just added to clears its sidebar dot —
    // optimistic locally, fire-and-forget on the server (see markRoomSeen).
    if (id && id !== DM_TAB_ID) {
      const channel = channels.find((c) => c.id === id);
      if (channel?.is_new) {
        setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, is_new: false } : c)));
        markRoomSeen(id).catch(() => {});
      }
    }
  }

  async function handleCreated(id: string) {
    const fresh = await listChannels().catch(() => null);
    if (fresh) setChannels(fresh);
    selectChannel(id);
  }

  function handleChannelUpdated(id: string, patch: { name?: string; has_password?: boolean }) {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function toggleRoomExpanded(id: string) {
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleJoined(id: string) {
    refreshChannel(id, { joined: true });
    setShowBrowse(false);
    selectChannel(id);
  }

  async function handleLeave(id: string) {
    if (!confirm("Rời khỏi phòng này?")) return;
    await leaveChannel(id);
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, joined: false } : c)));
    if (activeId === id) {
      selectChannel(channels.find((c) => c.is_general)?.id ?? null);
    }
  }

  async function handleDelete(id: string) {
    const childIds = channels.filter((c) => c.parent_channel_id === id).map((c) => c.id);
    const warning =
      childIds.length > 0
        ? `Xoá phòng này? Toàn bộ tin nhắn và ${childIds.length} phòng con bên trong sẽ mất.`
        : "Xoá phòng này? Toàn bộ tin nhắn sẽ mất.";
    if (!confirm(warning)) return;
    await deleteChannel(id);
    const removedIds = new Set([id, ...childIds]);
    setChannels((prev) => prev.filter((c) => !removedIds.has(c.id)));
    if (activeId && removedIds.has(activeId)) {
      selectChannel(channels.find((c) => c.is_general)?.id ?? null);
    }
  }

  async function handleRecallMessage(id: string) {
    if (!confirm("Thu hồi tin nhắn này? Mọi người sẽ thấy \"Đã thu hồi\" thay cho nội dung.")) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, is_recalled: true, content: "", attachment_url: null } : m)));
    try {
      await recallMeetingMessage(id);
    } catch {
      // best effort — a realtime UPDATE (or the next channel switch) will
      // reconcile if this silently failed server-side
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const already = reactions.some(
      (r) => r.message_id === messageId && r.profile_id === currentUser.id && r.emoji === emoji,
    );
    setReactions((prev) =>
      already
        ? prev.filter((r) => !(r.message_id === messageId && r.profile_id === currentUser.id && r.emoji === emoji))
        : [...prev, { message_id: messageId, profile_id: currentUser.id, emoji, created_at: new Date().toISOString() }],
    );
    setReactionPickerFor(null);
    try {
      if (already) await removeReaction(messageId, emoji);
      else await addReaction(messageId, emoji);
    } catch {
      // optimistic update may drift from the server on failure — next
      // channel load or a realtime event from another tab will correct it
    }
  }

  async function togglePin(message: MeetingMessage) {
    const pin = !message.pinned_at;
    const patch = { pinned_at: pin ? new Date().toISOString() : null, pinned_by: pin ? currentUser.id : null };
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, ...patch } : m)));
    setPinnedMessages((prev) =>
      pin ? [{ ...message, ...patch }, ...prev] : prev.filter((m) => m.id !== message.id),
    );
    try {
      await togglePinMessage(message.id, pin);
    } catch (err) {
      // revert the optimistic update on failure
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
      setPinnedMessages((prev) => (pin ? prev.filter((m) => m.id !== message.id) : [message, ...prev]));
      alert(err instanceof Error ? err.message : "Không thể ghim tin nhắn");
    }
  }

  // Free unofficial Google endpoint (see translate.ts) rather than dumping
  // the whole room through a translator — staff were copy-pasting a
  // client's English paste-in into Google Translate by hand, one message
  // at a time, only when they actually needed it.
  async function toggleTranslate(message: MeetingMessage) {
    if (shownTranslationIds.has(message.id)) {
      setShownTranslationIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
      return;
    }
    if (translations[message.id] !== undefined) {
      setShownTranslationIds((prev) => new Set(prev).add(message.id));
      return;
    }
    setTranslatingIds((prev) => new Set(prev).add(message.id));
    try {
      const { translated } = await translateMessage(message.content);
      setTranslations((prev) => ({ ...prev, [message.id]: translated }));
      setShownTranslationIds((prev) => new Set(prev).add(message.id));
    } catch {
      alert("Không thể dịch lúc này, thử lại sau.");
    } finally {
      setTranslatingIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
    }
  }

  // iPad/tablet: there's no hover, so the small 😊/↩/✕ row never reveals
  // itself, and tapping a bubble just triggers iOS's native text-selection
  // callout. A finger-or-pen press-and-hold on the bubble opens the quick
  // reaction picker instead — same gesture as iMessage/Messenger. Mouse
  // users already have the hover row, so this only arms for touch/pen.
  function handleBubblePressStart(e: React.PointerEvent, messageId: string) {
    if (e.pointerType === "mouse") return;
    // A press directly on the message text is left alone — native
    // selection/copy still works there. Only a press on the bubble's own
    // padding (background, not the text itself) arms the reaction picker.
    if ((e.target as HTMLElement).closest(".fk-message-text")) return;
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setShowEmojiPicker(false);
      setReactionPickerFor(messageId);
    }, 450);
  }

  function cancelBubblePress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // Lets a screenshot copied to the clipboard (or any image, really) go
  // straight into the composer with Ctrl+V, same as Slack/Messenger — no
  // need to save it to disk first and use the 📎 picker. Checks
  // clipboardData.files first (the simplest, most broadly-supported path
  // for an actual image file on the clipboard) and only falls back to
  // walking clipboardData.items — which some screenshot tools use instead,
  // and which isn't reliably array-iterable across browsers, hence
  // Array.from() rather than for...of — if that comes up empty.
  // Grows the composer with the message instead of scrolling the text
  // sideways in a single line, so a long message stays readable before
  // sending — capped so it doesn't take over the whole screen.
  useEffect(() => {
    const el = textInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    let file: File | null = null;

    if (clipboardData.files && clipboardData.files.length > 0) {
      file = Array.from(clipboardData.files).find((f) => f.type.startsWith("image/")) ?? null;
    }

    if (!file && clipboardData.items) {
      for (const item of Array.from(clipboardData.items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          file = item.getAsFile();
          if (file) break;
        }
      }
    }

    if (!file) return;

    e.preventDefault();
    if (file.size > 20 * 1024 * 1024) {
      setError("Tệp vượt quá 20MB");
      return;
    }
    setError(null);
    setPendingFile(file);
  }

  function pickMention(p: Profile) {
    setText((prev) => prev.replace(/(^|\s)@([\p{L}0-9]*)$/u, (_m, pre: string) => `${pre}@${p.display_name} `));
    textInputRef.current?.focus();
  }

  function pickAllMention() {
    setText((prev) => prev.replace(/(^|\s)@([\p{L}0-9]*)$/u, (_m, pre: string) => `${pre}@all `));
    textInputRef.current?.focus();
  }

  const attemptSend = useCallback(
    async (channelId: string, tempId: string, content: string, file: File | null, replyId: string | null) => {
      setFailedIds((prev) => {
        if (!prev.has(tempId)) return prev;
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
      setPendingIds((prev) => new Set(prev).add(tempId));
      try {
        let formData: FormData | undefined;
        if (file) {
          formData = new FormData();
          formData.append("file", file);
        }
        const sent = await sendMeetingMessage(channelId, content, formData, replyId);
        if (sent) {
          setMessages((prev) => mergeServerMessage(prev, sent, tempId));
          pendingPayloadsRef.current.delete(tempId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không thể gửi tin nhắn.");
        setFailedIds((prev) => new Set(prev).add(tempId));
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
      }
    },
    [mergeServerMessage],
  );

  // Appears instantly instead of waiting on the send round-trip — matches
  // how Zalo/Messenger feel, versus the message only showing up once the
  // server confirms it. Failed sends stay in the list (tagged in
  // failedIds) with a retry affordance rather than dumping the text back
  // into the composer.
  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId) return;
    const trimmed = text.trim();
    const file = pendingFile;
    if (!trimmed && !file) return;
    const replyId = replyingTo?.id ?? null;

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: MeetingMessage = {
      id: tempId,
      channel_id: activeId,
      sender_id: currentUser.id,
      content: trimmed,
      attachment_url: null,
      attachment_filename: file?.name ?? null,
      attachment_mime: file?.type ?? null,
      attachment_size: file?.size ?? null,
      reply_to_message_id: replyId,
      is_recalled: false,
      pinned_at: null,
      pinned_by: null,
      created_at: new Date().toISOString(),
    };

    setError(null);
    setText("");
    setPendingFile(null);
    setReplyingTo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    pendingPayloadsRef.current.set(tempId, { content: trimmed, file, replyId });
    setMessages((prev) => [...prev, optimistic]);
    attemptSend(activeId, tempId, trimmed, file, replyId);
  }

  function retrySend(tempId: string) {
    if (!activeId) return;
    const payload = pendingPayloadsRef.current.get(tempId);
    if (!payload) return;
    attemptSend(activeId, tempId, payload.content, payload.file, payload.replyId);
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Room list — a persistent column at sm+, a full-screen overlay on phones */}
      <div
        className={`${showRoomListMobile ? "flex fixed inset-0 z-40" : "hidden"} sm:flex sm:static sm:z-auto flex-col gap-3 px-3 py-4 sm:w-[240px] sm:flex-none`}
        style={{ borderRight: "1px solid var(--color-neutral-200)", background: "var(--color-bg)" }}
      >
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: "var(--color-neutral-500)" }}>
            TRÒ CHUYỆN
          </span>
          <div className="flex items-center gap-1">
            {isDirectorOrPm && (
              <button
                type="button"
                onClick={() => setShowLabelsEditor(true)}
                className="btn-icon"
                style={{ width: 24, height: 24, padding: 0 }}
                aria-label="Đổi tên Chung / Riêng"
                title="Đổi tên Chung / Riêng"
              >
                ✏️
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowRoomListMobile(false)}
              className="btn-icon sm:hidden"
              style={{ width: 24, height: 24, padding: 0 }}
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-none">
          {generalRoom && (() => {
            const roomUnread = meetingUnreadCounts[generalRoom.id] ?? 0;
            return (
              <div className="flex items-center gap-0.5">
                <span className="flex-none" style={{ width: 18 }} />
                <button
                  type="button"
                  onClick={() => selectChannel(generalRoom.id)}
                  className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-left text-[13px] font-semibold flex-1 min-w-0"
                  style={{
                    background: activeId === generalRoom.id ? "var(--color-accent-100)" : undefined,
                    color: activeId === generalRoom.id ? "var(--color-accent-700)" : "var(--color-text)",
                  }}
                >
                  <span aria-hidden>{generalRoom.icon}</span>
                  <span className="flex-1 truncate">{generalRoom.name}</span>
                  {roomUnread > 0 && (
                    <span
                      className="flex items-center justify-center rounded-full font-bold flex-none"
                      style={{ minWidth: 16, height: 16, padding: "0 4px", fontSize: 9, background: "var(--status-red)", color: "#fff" }}
                    >
                      {roomUnread > 9 ? "9+" : roomUnread}
                    </span>
                  )}
                </button>
              </div>
            );
          })()}
          <div className="flex items-center gap-0.5">
            <span className="flex-none" style={{ width: 18 }} />
            <button
              type="button"
              onClick={() => selectChannel(DM_TAB_ID)}
              className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-left text-[13px] font-semibold flex-1 min-w-0"
              style={{
                background: activeId === DM_TAB_ID ? "var(--color-accent-100)" : undefined,
                color: activeId === DM_TAB_ID ? "var(--color-accent-700)" : "var(--color-text)",
              }}
            >
              <span aria-hidden>👤</span>
              <span className="flex-1 truncate">{dmTabLabel}</span>
              {dmTotalUnread > 0 && (
                <span
                  className="flex items-center justify-center rounded-full font-bold flex-none"
                  style={{ minWidth: 16, height: 16, padding: "0 4px", fontSize: 9, background: "var(--status-red)", color: "#fff" }}
                >
                  {dmTotalUnread > 9 ? "9+" : dmTotalUnread}
                </span>
              )}
            </button>
          </div>
          {foodRoom &&
            (() => {
              const roomUnread = meetingUnreadCounts[foodRoom.id] ?? 0;
              return (
                <div className="flex items-center gap-0.5">
                  <span className="flex-none" style={{ width: 18 }} />
                  <button
                    type="button"
                    onClick={() => selectChannel(foodRoom.id)}
                    className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-left text-[13px] font-semibold flex-1 min-w-0"
                    style={{
                      background: activeId === foodRoom.id ? "var(--color-accent-100)" : undefined,
                      color: activeId === foodRoom.id ? "var(--color-accent-700)" : "var(--color-text)",
                    }}
                  >
                    <span aria-hidden>{foodRoom.icon}</span>
                    <span className="flex-1 truncate">{foodRoom.name}</span>
                    {roomUnread > 0 && (
                      <span
                        className="flex items-center justify-center rounded-full font-bold flex-none"
                        style={{ minWidth: 16, height: 16, padding: "0 4px", fontSize: 9, background: "var(--status-red)", color: "#fff" }}
                      >
                        {roomUnread > 9 ? "9+" : roomUnread}
                      </span>
                    )}
                  </button>
                </div>
              );
            })()}
        </div>

        <div className="flex-none" style={{ borderTop: "1px solid var(--color-neutral-200)" }} />

        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: "var(--color-neutral-500)" }}>
            PHÒNG HỌP
          </span>
          <span className="flex items-center gap-0.5">
            <button type="button" onClick={() => setShowBrowse(true)} className="btn-icon" style={{ width: 28, height: 28, padding: 0, fontSize: 14 }} aria-label="Khám phá phòng">
              🔍
            </button>
            <button type="button" onClick={() => setShowCreate(true)} className="btn-icon" style={{ width: 28, height: 28, padding: 0, fontSize: 16 }} aria-label="Tạo phòng">
              ＋
            </button>
          </span>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto flex-1">
          {customTopLevelRooms.map((r) => {
            const roomUnread = meetingUnreadCounts[r.id] ?? 0;
            const children = childRoomsByParent.get(r.id) ?? [];
            const expanded = expandedRoomIds.has(r.id);
            return (
            <div key={r.id} className="contents">
              <div className="flex items-center gap-0.5">
                {children.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleRoomExpanded(r.id)}
                    className="btn-icon flex-none"
                    style={{ width: 18, height: 18, padding: 0, fontSize: 10 }}
                    aria-label={expanded ? "Thu gọn phòng con" : "Xổ phòng con"}
                  >
                    {expanded ? "▾" : "▸"}
                  </button>
                ) : (
                  <span className="flex-none" style={{ width: 18 }} />
                )}
                <button
                  type="button"
                  onClick={() => selectChannel(r.id)}
                  className="ws-nav-link flex items-center gap-2 px-2 py-2 rounded-[8px] text-left text-[13px] font-semibold flex-1 min-w-0"
                  style={{
                    background: activeId === r.id ? "var(--color-accent-100)" : undefined,
                    color: activeId === r.id ? "var(--color-accent-700)" : "var(--color-text)",
                  }}
                >
                  <span aria-hidden>{r.icon}</span>
                  <span className="flex-1 truncate">{r.name}</span>
                  {r.is_new && (
                    <span
                      className="flex-none rounded-full"
                      style={{ width: 7, height: 7, background: "var(--status-red)" }}
                      title="Bạn vừa được thêm vào phòng này"
                    />
                  )}
                  {r.has_password && (
                    <span aria-hidden style={{ fontSize: 11 }}>🔒</span>
                  )}
                  {roomUnread > 0 && (
                    <span
                      className="flex items-center justify-center rounded-full font-bold flex-none"
                      style={{ minWidth: 16, height: 16, padding: "0 4px", fontSize: 9, background: "var(--status-red)", color: "#fff" }}
                    >
                      {roomUnread > 9 ? "9+" : roomUnread}
                    </span>
                  )}
                </button>
              </div>
              {expanded &&
                children.map((child) => {
                  const childUnread = meetingUnreadCounts[child.id] ?? 0;
                  return (
                    <div key={child.id} className="contents">
                      <button
                        type="button"
                        onClick={() => selectChannel(child.id)}
                        className="ws-nav-link flex items-center gap-2 py-2 rounded-[8px] text-left text-[13px] font-semibold"
                        style={{
                          marginLeft: 26,
                          paddingLeft: 8,
                          paddingRight: 8,
                          background: activeId === child.id ? "var(--color-accent-100)" : undefined,
                          color: activeId === child.id ? "var(--color-accent-700)" : "var(--color-text)",
                        }}
                      >
                        <span aria-hidden>{child.icon}</span>
                        <span className="flex-1 truncate">{child.name}</span>
                        {child.is_new && (
                          <span
                            className="flex-none rounded-full"
                            style={{ width: 7, height: 7, background: "var(--status-red)" }}
                            title="Bạn vừa được thêm vào phòng này"
                          />
                        )}
                        {child.has_password && (
                          <span aria-hidden style={{ fontSize: 11 }}>🔒</span>
                        )}
                        {childUnread > 0 && (
                          <span
                            className="flex items-center justify-center rounded-full font-bold flex-none"
                            style={{ minWidth: 16, height: 16, padding: "0 4px", fontSize: 9, background: "var(--status-red)", color: "#fff" }}
                          >
                            {childUnread > 9 ? "9+" : childUnread}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>
            );
          })}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col min-w-0" style={{ position: "relative" }}>
        {activeId === DM_TAB_ID ? (
          <DirectMessagesPanel
            currentUser={currentUser}
            profiles={profiles}
            onOpenRoomList={() => setShowRoomListMobile(true)}
            initialPeerId={initialDmPeerId}
            label={dmTabLabel}
          />
        ) : !activeChannel ? (
          <div className="flex-1 flex flex-col">
            <button
              type="button"
              onClick={() => setShowRoomListMobile(true)}
              className="btn-icon sm:hidden m-3"
              style={{ width: 28, height: 28, padding: 0 }}
              aria-label="Danh sách phòng"
            >
              ☰
            </button>
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--color-neutral-500)" }}>
              Chọn hoặc tạo một phòng để bắt đầu trò chuyện.
            </div>
          </div>
        ) : (
          <>
            <div
              className="flex-none flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
            >
              <button
                type="button"
                onClick={() => setShowRoomListMobile(true)}
                className="btn-icon sm:hidden flex-none"
                style={{ width: 28, height: 28, padding: 0 }}
                aria-label="Danh sách phòng"
              >
                ☰
              </button>
              <span aria-hidden style={{ fontSize: 18 }}>{activeChannel.icon}</span>
              <span className="flex-1 min-w-0 flex flex-col">
                {activeChannel.parent_channel_id && (
                  <span className="text-[10px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                    ↳ {channels.find((c) => c.id === activeChannel.parent_channel_id)?.name ?? ""}
                  </span>
                )}
                <span className="font-bold truncate">{activeChannel.name}</span>
              </span>
              {displayedRoomMembers.length > 0 && (
                <span
                  className="hidden sm:flex items-center -space-x-2 flex-none"
                  title={displayedRoomMembers.map((m) => m.display_name).join(", ")}
                >
                  {displayedRoomMembers.slice(0, 5).map((m) => (
                    <span key={m.id} className="rounded-full" style={{ border: "2px solid var(--color-surface)" }}>
                      <Avatar profile={m} size={22} />
                    </span>
                  ))}
                  {displayedRoomMembers.length > 5 && (
                    <span
                      className="flex items-center justify-center rounded-full text-[10px] font-bold flex-none"
                      style={{
                        width: 22,
                        height: 22,
                        background: "var(--color-neutral-200)",
                        color: "var(--color-neutral-600)",
                        border: "2px solid var(--color-surface)",
                      }}
                    >
                      +{displayedRoomMembers.length - 5}
                    </span>
                  )}
                </span>
              )}
              {!activeChannel.is_general && !activeChannel.parent_channel_id && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateParentId(activeChannel.id);
                    setShowCreate(true);
                  }}
                  className="btn-icon flex-none"
                  style={{ width: 34, height: 34, padding: 0, fontSize: 16 }}
                  aria-label="Tạo phòng con"
                  title="Tạo phòng con trong phòng này"
                >
                  ➕
                </button>
              )}
              {!activeChannel.is_general && !activeChannel.is_food_room && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMember((v) => !v);
                    setShowMedia(false);
                    setShowSearch(false);
                    setShowPinned(false);
                  }}
                  className="btn-icon flex-none"
                  style={{ width: 34, height: 34, padding: 0, fontSize: 16 }}
                  aria-label="Thông tin phòng"
                  title="Thông tin phòng & thành viên"
                >
                  👥
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowMedia((v) => !v);
                  setShowSearch(false);
                  setShowAddMember(false);
                  setShowPinned(false);
                }}
                className="btn-icon flex-none"
                style={{ width: 34, height: 34, padding: 0, fontSize: 16 }}
                aria-label="Ảnh, link & file"
                title="Ảnh, link & file đã chia sẻ trong phòng"
              >
                🖼
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPinned((v) => !v);
                  setShowMedia(false);
                  setShowSearch(false);
                  setShowAddMember(false);
                }}
                className="btn-icon flex-none relative"
                style={{ width: 34, height: 34, padding: 0, fontSize: 16 }}
                aria-label="Tin đã ghim"
                title="Tin nhắn đã ghim"
              >
                📌
                {pinnedMessages.length > 0 && (
                  <span
                    className="absolute flex items-center justify-center rounded-full font-bold"
                    style={{
                      top: -2,
                      right: -2,
                      minWidth: 14,
                      height: 14,
                      padding: "0 3px",
                      fontSize: 8,
                      background: "var(--status-red)",
                      color: "#fff",
                    }}
                  >
                    {pinnedMessages.length > 9 ? "9+" : pinnedMessages.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSearch((v) => !v);
                  setShowMedia(false);
                  setShowAddMember(false);
                  setShowPinned(false);
                }}
                className="btn-icon flex-none"
                style={{ width: 34, height: 34, padding: 0, fontSize: 16 }}
                aria-label="Tìm kiếm tin nhắn"
                title="Tìm kiếm tin nhắn"
              >
                🔍
              </button>
              {!activeChannel.is_general && !activeChannel.is_food_room && (
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

            {showCallBanner && (
              <div
                className="flex-none flex items-center gap-2 px-4 py-2"
                style={{ background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
              >
                <span
                  className="rounded-full flex-none"
                  style={{ width: 7, height: 7, background: "var(--status-red)" }}
                  aria-hidden
                />
                <span className="text-[13px] font-semibold flex-1 truncate">
                  📹 {othersOnCall.map((p) => p.display_name).join(", ")} đang gọi video
                </span>
                <button
                  type="button"
                  onClick={() => setDismissedCallKey(callRoomKey)}
                  className="btn btn-secondary btn-sm flex-none"
                >
                  Từ chối
                </button>
                <button type="button" onClick={() => setShowVideoCall(true)} className="btn btn-primary btn-sm flex-none">
                  Tham gia
                </button>
              </div>
            )}

            {activeChannel.is_food_room && (
              <FoodOrderPanel channelId={activeChannel.id} currentUserId={currentUser.id} profileById={profileById} />
            )}

            {showSearch && (
              <div className="flex-none flex flex-col" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                <div className="flex items-center gap-2 px-4 py-2">
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (e.target.value.trim().length >= 2) setSearching(true);
                    }}
                    placeholder="Tìm tin nhắn trong Trò chuyện & họp… (mọi phòng)"
                    className="input flex-1"
                    style={{ padding: "6px 10px", fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setShowSearch(false);
                      setSearchQuery("");
                    }}
                    className="btn-icon flex-none"
                    style={{ width: 28, height: 28, padding: 0 }}
                    aria-label="Đóng tìm kiếm"
                  >
                    ✕
                  </button>
                </div>
                {searchQuery.trim().length >= 2 && (
                  <div className="overflow-y-auto" style={{ maxHeight: 320, borderTop: "1px solid var(--color-neutral-200)" }}>
                    {searching ? (
                      <p className="text-[12px] text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                        Đang tìm…
                      </p>
                    ) : searchResults.length === 0 ? (
                      <p className="text-[12px] text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                        Không tìm thấy tin nhắn nào.
                      </p>
                    ) : (
                      searchResults.map((r) => {
                        const sender = profileById.get(r.sender_id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => pickSearchResult(r)}
                            className="ws-nav-link flex items-start gap-2.5 px-4 py-2 text-left w-full"
                          >
                            <Avatar profile={sender} size={26} />
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-1.5">
                                <span className="text-[12px] font-bold">{sender?.display_name ?? "Ẩn danh"}</span>
                                <span className="tag tag-neutral" style={{ fontSize: 9 }}>
                                  {r.channel_icon} {r.channel_name}
                                </span>
                              </span>
                              <span className="block text-[12px] truncate" style={{ color: "var(--color-neutral-600)" }}>
                                {highlightMatch(r.content, searchQuery)}
                              </span>
                            </span>
                            <span className="text-[10px] flex-none" style={{ color: "var(--color-neutral-500)" }}>
                              {formatTime(r.created_at)}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {showMedia && (
              <div
                className="card elev-lg flex flex-col"
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: 340,
                  maxWidth: "90%",
                  zIndex: 20,
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  overflow: "hidden",
                }}
              >
                <div className="flex items-center gap-2 px-4 pt-2.5">
                  {(
                    [
                      ["images", `🖼 Hình ảnh (${channelMedia.images.length})`],
                      ["links", `🔗 Link (${channelMedia.links.length})`],
                      ["files", `📄 File (${channelMedia.files.length})`],
                    ] as const
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setMediaTab(tab)}
                      className="px-2.5 py-1.5 text-[12px] font-semibold rounded-[8px]"
                      style={{
                        background: mediaTab === tab ? "var(--color-accent-100)" : "transparent",
                        color: mediaTab === tab ? "var(--color-accent-700)" : "var(--color-neutral-600)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowMedia(false)}
                    className="btn-icon flex-none ml-auto"
                    style={{ width: 26, height: 26, padding: 0 }}
                    aria-label="Đóng"
                  >
                    ✕
                  </button>
                </div>
                <div className="px-4 py-2">
                  <input
                    type="text"
                    value={mediaSearch}
                    onChange={(e) => setMediaSearch(e.target.value)}
                    placeholder={
                      mediaTab === "images"
                        ? "Tìm theo tên tệp hoặc người gửi…"
                        : mediaTab === "links"
                          ? "Tìm theo link hoặc người gửi…"
                          : "Tìm theo tên tệp hoặc người gửi…"
                    }
                    className="input"
                    style={{ padding: "6px 10px", fontSize: 13 }}
                  />
                </div>
                <div className="overflow-y-auto px-4 pb-3 flex-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
                  {mediaTab === "images" &&
                    (() => {
                      const q = mediaSearch.trim().toLowerCase();
                      const items = channelMedia.images.filter((m) => {
                        if (!q) return true;
                        const sender = profileById.get(m.sender_id);
                        return (
                          (m.attachment_filename ?? "").toLowerCase().includes(q) ||
                          (sender?.display_name ?? "").toLowerCase().includes(q)
                        );
                      });
                      return items.length === 0 ? (
                        <p className="text-[12px] text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                          Chưa có ảnh nào.
                        </p>
                      ) : (
                        <div className="grid gap-2 pt-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))" }}>
                          {items.map((m) => {
                            const sender = profileById.get(m.sender_id);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => m.attachment_url && setLightbox({ url: m.attachment_url, filename: m.attachment_filename })}
                                title={`${m.attachment_filename ?? ""} · ${sender?.display_name ?? "Ẩn danh"}`}
                                className="flex flex-col gap-0.5"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={thumbnailUrl(m.attachment_url, 180)}
                                  alt={m.attachment_filename ?? ""}
                                  className="rounded-[8px] object-cover w-full"
                                  style={{ aspectRatio: "1 / 1" }}
                                />
                                <span className="text-[10px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                                  {sender?.display_name ?? "Ẩn danh"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  {mediaTab === "links" &&
                    (() => {
                      const q = mediaSearch.trim().toLowerCase();
                      const items = channelMedia.links.filter((l) => {
                        if (!q) return true;
                        const sender = profileById.get(l.message.sender_id);
                        return l.url.toLowerCase().includes(q) || (sender?.display_name ?? "").toLowerCase().includes(q);
                      });
                      return items.length === 0 ? (
                        <p className="text-[12px] text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                          Chưa có link nào.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1 pt-2">
                          {items.map((l, i) => {
                            const sender = profileById.get(l.message.sender_id);
                            return (
                              <a
                                key={`${l.message.id}-${i}`}
                                href={l.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex flex-col gap-0.5 rounded-[8px] px-2.5 py-1.5"
                                style={{ background: "var(--color-surface)" }}
                              >
                                <span className="text-[12px] font-semibold truncate" style={{ color: "var(--color-accent-700)" }}>
                                  {l.url}
                                </span>
                                <span className="text-[10px]" style={{ color: "var(--color-neutral-500)" }}>
                                  {sender?.display_name ?? "Ẩn danh"} · {formatTime(l.message.created_at)}
                                </span>
                              </a>
                            );
                          })}
                        </div>
                      );
                    })()}
                  {mediaTab === "files" &&
                    (() => {
                      const q = mediaSearch.trim().toLowerCase();
                      const items = channelMedia.files.filter((m) => {
                        if (!q) return true;
                        const sender = profileById.get(m.sender_id);
                        return (
                          (m.attachment_filename ?? "").toLowerCase().includes(q) ||
                          (sender?.display_name ?? "").toLowerCase().includes(q)
                        );
                      });
                      return items.length === 0 ? (
                        <p className="text-[12px] text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                          Chưa có file nào.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1 pt-2">
                          {items.map((m) => {
                            const sender = profileById.get(m.sender_id);
                            return (
                              <a
                                key={m.id}
                                href={m.attachment_url ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-[8px] px-2.5 py-1.5"
                                style={{ background: "var(--color-surface)" }}
                              >
                                <span aria-hidden>📄</span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-[12px] font-semibold truncate">{m.attachment_filename}</span>
                                  <span className="block text-[10px]" style={{ color: "var(--color-neutral-500)" }}>
                                    {sender?.display_name ?? "Ẩn danh"} · {formatTime(m.created_at)}
                                  </span>
                                </span>
                              </a>
                            );
                          })}
                        </div>
                      );
                    })()}
                </div>
              </div>
            )}

            {showPinned && (
              <div
                className="card elev-lg flex flex-col"
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: 340,
                  maxWidth: "90%",
                  zIndex: 20,
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  overflow: "hidden",
                }}
              >
                <div className="flex items-center gap-2 px-4 pt-2.5 pb-2">
                  <span className="text-sm font-bold flex-1">📌 Tin đã ghim ({pinnedMessages.length})</span>
                  <button
                    type="button"
                    onClick={() => setShowPinned(false)}
                    className="btn-icon flex-none"
                    style={{ width: 26, height: 26, padding: 0 }}
                    aria-label="Đóng"
                  >
                    ✕
                  </button>
                </div>
                <div className="overflow-y-auto px-4 pb-3 flex-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
                  {pinnedMessages.length === 0 ? (
                    <p className="text-[12px] text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
                      Chưa có tin nhắn nào được ghim.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2 pt-2">
                      {pinnedMessages.map((m) => {
                        const sender = profileById.get(m.sender_id);
                        return (
                          <div key={m.id} className="flex flex-col gap-1 rounded-[8px] px-2.5 py-2" style={{ background: "var(--color-surface)" }}>
                            <button
                              type="button"
                              className="text-left"
                              onClick={() => {
                                setShowPinned(false);
                                const el = document.getElementById(`meeting-msg-${m.id}`);
                                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                                el?.classList.add("fk-flash-highlight");
                                setTimeout(() => el?.classList.remove("fk-flash-highlight"), 1600);
                              }}
                            >
                              <span className="block text-[12px] font-semibold">{sender?.display_name ?? "Ẩn danh"}</span>
                              <span className="block text-[12px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                                {m.content || (m.attachment_url ? "📎 Tệp đính kèm" : "")}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => togglePin(m)}
                              className="self-end text-[11px] font-bold"
                              style={{ color: "var(--color-accent-700)" }}
                            >
                              Bỏ ghim
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showAddMember && (
              <RoomInfoDropdown
                channelId={activeChannel.id}
                channelName={activeChannel.name}
                hasPassword={activeChannel.has_password}
                isOwner={activeChannel.created_by === currentUser.id}
                profiles={profiles.filter((p) => p.id !== currentUser.id)}
                onClose={() => setShowAddMember(false)}
                onUpdated={(patch) => handleChannelUpdated(activeChannel.id, patch)}
                onMemberAdded={(profileId) => {
                  const p = profiles.find((pr) => pr.id === profileId);
                  if (p) setRoomMembers((prev) => (prev.some((m) => m.id === p.id) ? prev : [...prev, p]));
                }}
                onMemberRemoved={(profileId) => {
                  setRoomMembers((prev) => prev.filter((m) => m.id !== profileId));
                }}
              />
            )}

            <div
              ref={listRef}
              onScroll={handleListScroll}
              className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col p-4"
              style={{ touchAction: "pan-y" }}
            >
              {messages.length === 0 && (
                <p className="text-[13px] text-center mt-4" style={{ color: "var(--color-neutral-500)" }}>
                  Chưa có tin nhắn nào trong phòng này.
                </p>
              )}
              {messages.map((m, index) => {
                const sender = profileById.get(m.sender_id);
                // Zalo/Messenger-style grouping: consecutive messages from the
                // same person within a few minutes only show the avatar/name
                // once, with tight spacing between them — the repeated
                // avatar + name + full gap on every single message (even
                // several in a row from the same person seconds apart) was
                // exactly the "too much dead space" staff were pointing out.
                const prev = index > 0 ? messages[index - 1] : null;
                const next = index < messages.length - 1 ? messages[index + 1] : null;
                const isNewDay = !prev || !isSameCalendarDay(m.created_at, prev.created_at);
                const isGroupStart =
                  !prev ||
                  isNewDay ||
                  prev.sender_id !== m.sender_id ||
                  new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
                // Same idea in reverse — only the last message of a run shows
                // its time, like Zalo/Messenger, instead of repeating it under
                // every single message in the group.
                const isGroupEnd =
                  !next ||
                  next.sender_id !== m.sender_id ||
                  new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > 5 * 60 * 1000;
                const mine = m.sender_id === currentUser.id;
                const isPending = pendingIds.has(m.id);
                const isFailed = failedIds.has(m.id);
                const msgReactions = reactions.filter((r) => r.message_id === m.id);
                const grouped = msgReactions.reduce<Record<string, string[]>>((acc, r) => {
                  (acc[r.emoji] ??= []).push(r.profile_id);
                  return acc;
                }, {});
                const seenBy = seenByMessageId.get(m.id) ?? [];
                const quoted = m.reply_to_message_id ? messageById.get(m.reply_to_message_id) : undefined;
                const quotedSender = quoted ? profileById.get(quoted.sender_id) : undefined;

                const actionButtons = (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmojiPicker(false);
                        setMoreMenuFor(null);
                        setReactionPickerFor(reactionPickerFor === m.id ? null : m.id);
                      }}
                      className="btn-icon"
                      style={{ width: 20, height: 20, padding: 0, fontSize: 11 }}
                      aria-label="Thả cảm xúc"
                    >
                      😊
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReactionPickerFor(null);
                        setMoreMenuFor(moreMenuFor === m.id ? null : m.id);
                      }}
                      className="btn-icon"
                      style={{ width: 20, height: 20, padding: 0, fontSize: 13 }}
                      aria-label="Thêm tuỳ chọn"
                      title="Thêm"
                    >
                      ⋯
                    </button>
                    {moreMenuFor === m.id &&
                      (() => {
                        const menuItems = (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setReplyingTo(m);
                                setMoreMenuFor(null);
                                textInputRef.current?.focus();
                              }}
                              className="ws-nav-link flex items-center gap-2 px-3 py-2.5 rounded-[8px] text-[14px] font-semibold text-left"
                            >
                              ↩ Trả lời
                            </button>
                            {m.content && (
                              <button
                                type="button"
                                onClick={() => {
                                  setMoreMenuFor(null);
                                  toggleTranslate(m);
                                }}
                                disabled={translatingIds.has(m.id)}
                                className="ws-nav-link flex items-center gap-2 px-3 py-2.5 rounded-[8px] text-[14px] font-semibold text-left"
                              >
                                🌐 {translatingIds.has(m.id) ? "Đang dịch…" : "Dịch Anh ⇄ Việt"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setMoreMenuFor(null);
                                setForwarding({
                                  content: m.content,
                                  attachment: m.attachment_url
                                    ? { url: m.attachment_url, filename: m.attachment_filename, mime: m.attachment_mime, size: m.attachment_size }
                                    : null,
                                });
                              }}
                              className="ws-nav-link flex items-center gap-2 px-3 py-2.5 rounded-[8px] text-[14px] font-semibold text-left"
                            >
                              ➡️ Chuyển tiếp
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMoreMenuFor(null);
                                togglePin(m);
                              }}
                              className="ws-nav-link flex items-center gap-2 px-3 py-2.5 rounded-[8px] text-[14px] font-semibold text-left"
                            >
                              📌 {m.pinned_at ? "Bỏ ghim" : "Ghim"}
                            </button>
                            {mine && !m.is_recalled && (
                              <button
                                type="button"
                                onClick={() => {
                                  setMoreMenuFor(null);
                                  handleRecallMessage(m.id);
                                }}
                                className="ws-nav-link flex items-center gap-2 px-3 py-2.5 rounded-[8px] text-[14px] font-semibold text-left"
                                style={{ color: "var(--status-red, #c22)" }}
                              >
                                ✕ Thu hồi
                              </button>
                            )}
                          </>
                        );

                        // Phone keeps the centered sheet (built to dodge the
                        // cut-off/clipping a viewport-edge-anchored popover
                        // got into on small screens) — iPad/desktop have
                        // room to spare, so there sếp Phúc wants the older
                        // dropdown-from-the-⋯-button behavior back.
                        return isMobile ? (
                          <Modal onClose={() => setMoreMenuFor(null)} maxWidth={300}>
                            <div className="flex flex-col p-1.5">{menuItems}</div>
                          </Modal>
                        ) : (
                          <div
                            ref={popoverRef}
                            className="card elev-lg flex flex-col p-1.5"
                            style={{
                              position: "absolute",
                              bottom: "100%",
                              [mine ? "right" : "left"]: 0,
                              marginBottom: 6,
                              zIndex: 10,
                              minWidth: 190,
                            }}
                          >
                            {menuItems}
                          </div>
                        );
                      })()}
                    {reactionPickerFor === m.id && (
                      <div
                        ref={popoverRef}
                        className="card elev-lg flex items-center gap-1 p-1.5"
                        style={{ position: "absolute", bottom: "100%", [mine ? "right" : "left"]: 0, marginBottom: 6, zIndex: 10 }}
                      >
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => toggleReaction(m.id, emoji)}
                            className="btn-icon"
                            style={{ width: 26, height: 26, padding: 0, fontSize: 15 }}
                            aria-label={emoji}
                          >
                            {emoji}
                          </button>
                        ))}
                        {m.content && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(m.content).catch(() => {});
                              setReactionPickerFor(null);
                            }}
                            className="btn-icon"
                            style={{ width: 26, height: 26, padding: 0, fontSize: 13 }}
                            aria-label="Sao chép"
                            title="Sao chép"
                          >
                            📋
                          </button>
                        )}
                      </div>
                    )}
                  </>
                );

                return (
                  <Fragment key={m.id}>
                    {isNewDay && (
                      <div className="flex items-center justify-center my-3">
                        <span
                          className="text-[11px] font-semibold px-3 py-1 rounded-full"
                          style={{ background: "var(--color-surface)", color: "var(--color-neutral-500)" }}
                        >
                          {formatDateDivider(m.created_at)}
                        </span>
                      </div>
                    )}
                    <div
                    id={`meeting-msg-${m.id}`}
                    className={`group flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}
                    style={{ marginTop: isGroupStart ? 12 : 2, opacity: isPending ? 0.6 : 1 }}
                  >
                    {isGroupStart ? <Avatar profile={sender} /> : <span className="flex-none" style={{ width: 28 }} />}
                    <div className={`flex flex-col min-w-0 ${mine ? "items-end" : "items-start"} max-w-[85%]`}>
                      {isGroupStart && (
                        <span className="text-[11px] font-semibold mb-0.5" style={{ color: "var(--color-neutral-500)" }}>
                          {mine ? "Bạn" : (sender?.display_name ?? "Ẩn danh")}
                        </span>
                      )}
                      {m.pinned_at && (
                        <span className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--color-accent-700)" }} title="Đã ghim">
                          📌 Đã ghim
                        </span>
                      )}
                      {m.is_recalled ? (
                        <div
                          className="rounded-[12px] px-3 py-2 text-sm italic"
                          style={{ background: "var(--color-surface)", color: "var(--color-neutral-500)" }}
                        >
                          Đã thu hồi
                        </div>
                      ) : (
                        <>
                      {m.reply_to_message_id && (
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(`meeting-msg-${m.reply_to_message_id}`);
                            el?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                          className="flex flex-col text-left rounded-[8px] px-2.5 py-1.5 mb-1 max-w-full"
                          style={{
                            background: "var(--color-surface)",
                            borderLeft: "3px solid var(--color-accent-500)",
                          }}
                        >
                          <span className="text-[11px] font-bold" style={{ color: "var(--color-accent-700)" }}>
                            {quoted ? (quotedSender?.display_name ?? "Ẩn danh") : "Tin nhắn gốc"}
                          </span>
                          <span className="text-[11px] truncate" style={{ color: "var(--color-neutral-500)", maxWidth: 220 }}>
                            {quoted ? (quoted.is_recalled ? "Đã thu hồi" : quoted.content || (quoted.attachment_url ? "📎 Tệp đính kèm" : "")) : "Đã bị xoá"}
                          </span>
                        </button>
                      )}
                      {m.content && (
                        <div className={`flex items-end gap-1 min-w-0 max-w-full ${mine ? "flex-row-reverse" : ""}`}>
                          <div
                            className="min-w-0 rounded-[12px] px-3 py-2 text-[17px] whitespace-pre-wrap break-words"
                            style={{
                              background: isFailed
                                ? "var(--status-red-100, #fde2e2)"
                                : mine
                                  ? "var(--color-accent-500)"
                                  : "var(--color-surface)",
                              color: isFailed ? "var(--status-red, #c22)" : mine ? "#fff" : "var(--color-text)",
                            }}
                            onPointerDown={(e) => handleBubblePressStart(e, m.id)}
                            onPointerUp={cancelBubblePress}
                            onPointerLeave={cancelBubblePress}
                            onPointerCancel={cancelBubblePress}
                            onContextMenu={(e) => {
                              if (longPressFiredRef.current) e.preventDefault();
                            }}
                          >
                            <span className="fk-message-text">{renderContent(m.content, namesPattern, mine)}</span>
                            {shownTranslationIds.has(m.id) && (
                              <div
                                className="mt-1.5 pt-1.5 text-[15px]"
                                style={{
                                  borderTop: `1px solid ${mine ? "rgba(255,255,255,.3)" : "var(--color-neutral-200)"}`,
                                  opacity: 0.9,
                                }}
                              >
                                <span
                                  className="text-[10px] font-bold block mb-0.5"
                                  style={{ opacity: 0.7, letterSpacing: "0.03em" }}
                                >
                                  🌐 ĐÃ DỊCH
                                </span>
                                {translations[m.id] || "(không có nội dung)"}
                              </div>
                            )}
                          </div>
                          <span className="fk-msg-actions relative inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-none">
                            {actionButtons}
                          </span>
                        </div>
                      )}
                      {m.attachment_url &&
                        (isImage(m.attachment_mime) ? (
                          <button
                            type="button"
                            onClick={() => setLightbox({ url: m.attachment_url!, filename: m.attachment_filename })}
                            className="mt-1 block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbnailUrl(m.attachment_url, 480)}
                              alt={m.attachment_filename ?? ""}
                              className="rounded-[10px] object-cover"
                              style={{ maxWidth: 340, maxHeight: 340 }}
                              onLoad={() => stickToBottomIfNear(false)}
                            />
                          </button>
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
                      {!m.attachment_url && m.attachment_filename && (
                        <div
                          className="mt-1 flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold"
                          style={{ background: "var(--color-surface)", color: "var(--color-neutral-500)" }}
                        >
                          📎 {m.attachment_filename} {isFailed ? "— chưa gửi được" : "— đang gửi…"}
                        </div>
                      )}

                      {Object.keys(grouped).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(grouped).map(([emoji, ids]) => {
                            const reactedByMe = ids.includes(currentUser.id);
                            const reactionKey = `${m.id}:${emoji}`;
                            const names = ids.map((id) => profileById.get(id)?.display_name ?? "").filter(Boolean);
                            return (
                              <span key={emoji} className="relative inline-block">
                                <button
                                  type="button"
                                  onClick={() => toggleReaction(m.id, emoji)}
                                  onMouseEnter={() => setHoveredReaction(reactionKey)}
                                  onMouseLeave={() => setHoveredReaction((prev) => (prev === reactionKey ? null : prev))}
                                  className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                                  style={{
                                    background: reactedByMe ? "var(--color-accent-100)" : "var(--color-surface)",
                                    border: `1px solid ${reactedByMe ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                                  }}
                                >
                                  <span aria-hidden>{emoji}</span>
                                  {ids.length}
                                </button>
                                {hoveredReaction === reactionKey && names.length > 0 && (
                                  <span
                                    className="absolute z-10 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap"
                                    style={{
                                      bottom: "calc(100% + 6px)",
                                      left: "50%",
                                      transform: "translateX(-50%)",
                                      background: "var(--color-neutral-900, #1a1a1a)",
                                      color: "#fff",
                                      boxShadow: "var(--shadow-md, 0 2px 8px rgba(0,0,0,.25))",
                                    }}
                                  >
                                    {emoji} {names.join(", ")}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                        </>
                      )}

                      {isFailed ? (
                        <button
                          type="button"
                          onClick={() => retrySend(m.id)}
                          className="text-[11px] font-semibold mt-0.5"
                          style={{ color: "var(--status-red, #c22)" }}
                        >
                          ⚠️ Gửi lỗi — Bấm để gửi lại
                        </button>
                      ) : isPending ? (
                        <span className="text-[10px] mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
                          Đang gửi…
                        </span>
                      ) : (
                        (isGroupEnd || (!m.content && !m.is_recalled)) && (
                        <span className="flex items-center gap-1.5 mt-0.5">
                          {isGroupEnd && (
                            <span className="text-[10px]" style={{ color: "var(--color-neutral-500)" }}>
                              {formatTime(m.created_at)}
                            </span>
                          )}
                          {!m.content && !m.is_recalled && (
                            <span className="fk-msg-actions relative inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {actionButtons}
                            </span>
                          )}
                        </span>
                        )
                      )}
                      {seenBy.length > 0 && (
                        <span className="flex items-center -space-x-1 mt-0.5" title={seenBy.map((id) => profileById.get(id)?.display_name ?? "").filter(Boolean).join(", ")}>
                          {seenBy.map((id) => (
                            <Avatar key={id} profile={profileById.get(id)} size={14} />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  </Fragment>
                );
              })}
            </div>

            {showJumpToBottom && (
              <button
                type="button"
                onClick={() => stickToBottomIfNear(true)}
                className="flex items-center justify-center rounded-full elev-lg"
                style={{
                  position: "absolute",
                  left: 20,
                  bottom: 84,
                  width: 40,
                  height: 40,
                  background: "var(--color-accent-500)",
                  color: "#fff",
                  fontSize: 18,
                  zIndex: 15,
                }}
                aria-label="Xuống tin nhắn mới nhất"
                title="Xuống tin nhắn mới nhất"
              >
                ↓
              </button>
            )}

            <div className="flex-none" style={{ borderTop: "1px solid var(--color-neutral-200)", position: "relative" }}>
              {(mentionCandidates.length > 0 || showAllMentionOption) && (
                <div
                  className="card elev-lg flex flex-col p-1.5 overflow-y-auto"
                  style={{ position: "absolute", bottom: "100%", left: 12, marginBottom: 6, width: 220, maxHeight: 260, zIndex: 10 }}
                >
                  {showAllMentionOption && (
                    <button
                      type="button"
                      onClick={pickAllMention}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-left text-[13px] font-semibold ws-nav-link"
                    >
                      <span
                        className="flex items-center justify-center rounded-full font-bold flex-none"
                        style={{ width: 22, height: 22, fontSize: 11, background: "var(--status-red)", color: "#fff" }}
                      >
                        📢
                      </span>
                      Tất cả mọi người
                    </button>
                  )}
                  {mentionCandidates.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickMention(p)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-left text-[13px] font-semibold ws-nav-link"
                    >
                      <Avatar profile={p} size={22} />
                      {p.display_name}
                    </button>
                  ))}
                </div>
              )}
              {showEmojiPicker && (
                <div
                  ref={popoverRef}
                  className="card elev-lg"
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 44,
                    marginBottom: 6,
                    width: 216,
                    padding: 8,
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: 2,
                    zIndex: 10,
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
              {replyingTo && (
                <div className="flex items-center gap-2 px-4 pt-2">
                  <div
                    className="flex flex-col flex-1 min-w-0 rounded-[8px] px-2.5 py-1.5"
                    style={{ background: "var(--color-surface)", borderLeft: "3px solid var(--color-accent-500)" }}
                  >
                    <span className="text-[11px] font-bold" style={{ color: "var(--color-accent-700)" }}>
                      Đang trả lời {replyingTo.sender_id === currentUser.id ? "chính mình" : (profileById.get(replyingTo.sender_id)?.display_name ?? "Ẩn danh")}
                    </span>
                    <span className="text-[11px] truncate" style={{ color: "var(--color-neutral-500)" }}>
                      {replyingTo.content || (replyingTo.attachment_url ? "📎 Tệp đính kèm" : "")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="btn-icon flex-none"
                    style={{ width: 22, height: 22, padding: 0, fontSize: 12 }}
                    aria-label="Bỏ trả lời"
                  >
                    ✕
                  </button>
                </div>
              )}
              {error && (
                <p className="text-[12px] font-semibold px-4 pt-2" style={{ color: "var(--status-red)" }}>
                  {error}
                </p>
              )}
              {pendingFile && (
                <div className="flex items-center gap-1.5 px-4 pt-2">
                  {pendingPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pendingPreviewUrl}
                      alt=""
                      className="rounded-[8px] object-cover flex-none"
                      style={{ width: 44, height: 44, border: "1px solid var(--color-neutral-200)" }}
                    />
                  ) : (
                    <span
                      className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] font-semibold truncate max-w-full"
                      style={{ background: "var(--color-surface)", color: "var(--color-accent-700)" }}
                    >
                      📄 {pendingFile.name}
                    </span>
                  )}
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
              <form ref={composerFormRef} onSubmit={handleSend} className="flex items-end gap-2 p-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-icon flex-none"
                  style={{ width: 34, height: 34, padding: 0, fontSize: 18 }}
                  aria-label="Gửi ảnh hoặc tệp"
                >
                  📎
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReactionPickerFor(null);
                    setShowEmojiPicker((v) => !v);
                  }}
                  className="btn-icon flex-none"
                  style={{ width: 34, height: 34, padding: 0, fontSize: 18 }}
                  aria-label="Chọn biểu tượng cảm xúc"
                >
                  😀
                </button>
                <button
                  type="button"
                  onClick={() => setShowVideoCall(true)}
                  className="btn-icon flex-none"
                  style={{ width: 34, height: 34, padding: 0, fontSize: 16 }}
                  aria-label="Gọi video"
                  title="Gọi video cả phòng"
                >
                  📞
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
                <textarea
                  ref={textInputRef}
                  className="input flex-1 resize-none"
                  style={{ maxHeight: 160, overflowY: "auto" }}
                  rows={1}
                  placeholder={isMobile ? "" : `Nhắn vào #${activeChannel.name}… (gõ @ để nhắc ai đó, dán ảnh bằng Ctrl+V)`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      composerFormRef.current?.requestSubmit();
                    }
                  }}
                />
                <button type="submit" className="btn btn-primary flex-none">
                  Gửi
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateRoomModal
          onClose={() => {
            setShowCreate(false);
            setCreateParentId(null);
          }}
          onCreated={(id) => {
            if (createParentId) setExpandedRoomIds((prev) => new Set(prev).add(createParentId));
            handleCreated(id);
          }}
          parentOptions={nestableRooms}
          initialParentId={createParentId}
        />
      )}
      {showVideoCall && activeChannel && (
        <VideoCallModal
          roomKey={`hop-${activeChannel.id}`}
          label={`📹 ${activeChannel.name}`}
          selfId={currentUser.id}
          displayName={currentUser.display_name}
          onClose={() => setShowVideoCall(false)}
        />
      )}
      {lightbox && (
        <ImageLightbox url={lightbox.url} filename={lightbox.filename} onClose={() => setLightbox(null)} />
      )}
      {showBrowse && (
        <BrowseRoomsModal rooms={browsableRooms} onClose={() => setShowBrowse(false)} onJoined={handleJoined} />
      )}
      {forwarding && (
        <ForwardMessageModal
          content={forwarding.content}
          attachment={forwarding.attachment}
          currentUserId={currentUser.id}
          onClose={() => setForwarding(null)}
        />
      )}
      {showLabelsEditor &&
        (() => {
          const generalChannel = channels.find((c) => c.is_general) ?? null;
          return (
            <RoomLabelsEditor
              onClose={() => setShowLabelsEditor(false)}
              generalChannelId={generalChannel?.id ?? null}
              generalChannelName={generalChannel?.name ?? "Chung"}
              dmTabLabel={dmTabLabel}
              onSaved={(patch) => {
                if (patch.generalName && generalChannel) handleChannelUpdated(generalChannel.id, { name: patch.generalName });
                if (patch.dmTabLabel) setDmTabLabelState(patch.dmTabLabel);
              }}
            />
          );
        })()}
    </div>
  );
}
