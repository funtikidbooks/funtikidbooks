"use client";

import { useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { deleteHourEntry, listWeekHourReports, logHours, setProjectWeeklyCap } from "@/lib/actions/hourReports";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { WEEKDAYS_SHORT, addDays, formatDayLabel, mondayOf, vnToday, weekDaysOf } from "@/lib/constants/attendance";
import type { HourReport, MeetingChannelPublic, Profile } from "@/lib/types";

// Whole giờ + whole phút (24h/60p, standard time units) — never a decimal
// hour count. hour_reports itself stores exact integers now (see
// supabase/migrations/hour_reports.sql), so this is pure formatting, no
// rounding ever happens here.
function formatHM(hours: number, minutes: number): string {
  return minutes === 0 ? `${hours}h` : `${hours}.${String(minutes).padStart(2, "0")}p`;
}

// Sums a list of exact (hours, minutes) pairs by adding whole minutes
// together and carrying the overflow into hours — the only way to combine
// several people's time for one cell/week without ever touching a decimal.
function sumHM(entries: { hours: number; minutes: number }[]): { hours: number; minutes: number } {
  const totalMinutes = entries.reduce((sum, e) => sum + e.hours * 60 + e.minutes, 0);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

// A small modal rather than an inline table-cell input — a note textarea
// inline would force that one day-column wider across every row in the
// table. The cell itself stays a bare number; content only shows up here,
// opened by clicking the day.
function HourEntryModal({
  projectLabel,
  date,
  otherEntries,
  initialHours,
  initialMinutes,
  initialNote,
  hasExisting,
  saving,
  deleting,
  onSave,
  onDelete,
  onClose,
}: {
  projectLabel: string;
  date: string;
  otherEntries: { profile: Profile; hours: number; minutes: number; note: string | null }[];
  initialHours: number;
  initialMinutes: number;
  initialNote: string;
  hasExisting: boolean;
  saving: boolean;
  deleting: boolean;
  onSave: (hours: number, minutes: number, note: string) => Promise<string | void>;
  onDelete: () => Promise<string | void>;
  onClose: () => void;
}) {
  // Giờ + phút as two plain integer fields (phút capped 0–59) — no decimal
  // anywhere in the input path, so there's no "8.30 nghĩa là gì" ambiguity
  // to begin with.
  const [hoursPart, setHoursPart] = useState(initialHours > 0 ? String(initialHours) : "");
  const [minutesPart, setMinutesPart] = useState(initialMinutes > 0 ? String(initialMinutes) : "");
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} maxWidth={360}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const h = Number(hoursPart || "0");
          const m = Number(minutesPart || "0");
          if (!(m >= 0 && m <= 59)) {
            setError("Phút chỉ từ 0 đến 59 (1 giờ = 60 phút).");
            return;
          }
          setError((await onSave(h, m, note)) || null);
        }}
        className="flex flex-col gap-4 p-6"
      >
        <div>
          <h2 className="text-lg">{projectLabel}</h2>
          <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            {formatDayLabel(date)}
          </p>
        </div>

        {/* Read-only — this is what sếp Phúc/PM actually opens the cell to
            check: what did everyone else on this project write for that
            day. The editable form below is only ever your own entry. */}
        {otherEntries.length > 0 && (
          <div className="flex flex-col gap-2 p-3 rounded-[8px]" style={{ background: "var(--color-surface)" }}>
            {otherEntries.map(({ profile, hours: h, minutes: m, note: n }) => (
              <div key={profile.id} className="flex gap-2">
                <AttendanceAvatar profile={profile} size={22} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{profile.display_name}</span>
                    <span className="text-sm font-bold flex-none">{formatHM(h, m)}</span>
                  </div>
                  {n && (
                    <p className="text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
                      {n}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <label htmlFor="hr-hours">{otherEntries.length > 0 ? "Giờ của bạn" : "Số giờ"}</label>
          <div className="flex items-center gap-2">
            <input
              id="hr-hours"
              autoFocus
              type="text"
              inputMode="numeric"
              className="input text-center"
              style={{ width: 64 }}
              placeholder="0"
              value={hoursPart}
              onChange={(e) => setHoursPart(e.target.value.replace(/[^0-9]/g, ""))}
            />
            <span className="text-sm font-semibold" style={{ color: "var(--color-neutral-500)" }}>
              giờ
            </span>
            <input
              id="hr-minutes"
              type="text"
              inputMode="numeric"
              className="input text-center"
              style={{ width: 64 }}
              placeholder="0"
              value={minutesPart}
              onChange={(e) => setMinutesPart(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
            />
            <span className="text-sm font-semibold" style={{ color: "var(--color-neutral-500)" }}>
              phút
            </span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="hr-note">Nội dung công việc</label>
          <textarea
            id="hr-note"
            className="input resize-none"
            rows={3}
            placeholder="vd. sketch chapter 9 (tranh 1,2,4)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          {hasExisting ? (
            <button
              type="button"
              onClick={async () => setError((await onDelete()) || null)}
              className="btn btn-danger btn-sm"
              disabled={saving || deleting}
            >
              {deleting ? "Đang xoá…" : "🗑 Xoá"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="btn btn-ghost" disabled={saving || deleting}>
              Huỷ
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || deleting}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// Read-only "peek" — hover on desktop (mouse has room to spare, so this can
// be roomy), press-and-hold on iPad/phone (no hover there). Separate from
// HourEntryModal's edit form: this is purely for a quick look at what's
// already logged, dismissed by moving the mouse away or tapping outside.
// Shared shell for both CellPeekPopup and TodayInfoPopup below — positions
// itself off the anchor rect (opening whichever of up/down has room),
// grows out of that rect with the same zoom-in used everywhere else in
// this file, and only renders a dismiss backdrop for the touch/long-press
// path (hover already closes itself via onMouseLeave — a backdrop there
// would sit above the very anchor being hovered and swallow its click).
function FloatingPopup({
  rect,
  width = 300,
  dismissOnBackdrop,
  onClose,
  children,
}: {
  rect: DOMRect;
  width?: number;
  dismissOnBackdrop: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const margin = 8;
  const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - margin);
  const spaceBelow = window.innerHeight - rect.bottom;
  const opensDown = spaceBelow > 260 || spaceBelow > rect.top;
  const originX = `${Math.min(100, Math.max(0, (((rect.left + rect.width / 2 - left) / width) * 100)))}%`;
  const originY = opensDown ? "0%" : "100%";

  return (
    <>
      {dismissOnBackdrop && (
        <div onClick={onClose} onTouchStart={onClose} style={{ position: "fixed", inset: 0, zIndex: 45 }} />
      )}
      <div
        className="card elev-lg flex flex-col gap-3 p-4 fk-popup-in"
        style={{
          position: "fixed",
          left,
          top: opensDown ? rect.bottom + margin : undefined,
          bottom: opensDown ? undefined : window.innerHeight - rect.top + margin,
          width,
          maxHeight: 320,
          overflowY: "auto",
          zIndex: 46,
          ["--popup-origin-x" as string]: originX,
          ["--popup-origin-y" as string]: originY,
        }}
      >
        {children}
      </div>
    </>
  );
}

function CellPeekPopup({
  rect,
  projectLabel,
  date,
  entries,
  dismissOnBackdrop,
  onClose,
}: {
  rect: DOMRect;
  projectLabel: string;
  date: string;
  entries: { profile: Profile; hours: number; minutes: number; note: string | null }[];
  dismissOnBackdrop: boolean;
  onClose: () => void;
}) {
  return (
    <FloatingPopup rect={rect} dismissOnBackdrop={dismissOnBackdrop} onClose={onClose}>
      <div>
        <p className="text-sm font-bold">{projectLabel}</p>
        <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
          {formatDayLabel(date)}
        </p>
      </div>
      {entries.map(({ profile, hours, minutes, note }) => (
        <div key={profile.id} className="flex gap-2.5">
          <AttendanceAvatar profile={profile} size={26} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold truncate">{profile.display_name}</span>
              <span className="text-sm font-bold flex-none">{formatHM(hours, minutes)}</span>
            </div>
            {note && (
              <p className="text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
                {note}
              </p>
            )}
          </div>
        </div>
      ))}
    </FloatingPopup>
  );
}

// Same hover/long-press pattern as a day cell, opened from the "today"
// column header instead — just tells you which day is still in progress,
// same as Upwork's own "This day is in progress" hint on its timesheet.
function TodayInfoPopup({
  rect,
  date,
  dismissOnBackdrop,
  onClose,
}: {
  rect: DOMRect;
  date: string;
  dismissOnBackdrop: boolean;
  onClose: () => void;
}) {
  return (
    <FloatingPopup rect={rect} width={240} dismissOnBackdrop={dismissOnBackdrop} onClose={onClose}>
      <p className="text-sm font-bold">Hôm nay — {formatDayLabel(date)}</p>
      <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
        Ngày đang diễn ra — giờ có thể còn thay đổi trong hôm nay.
      </p>
    </FloatingPopup>
  );
}

// Upwork-style shared weekly timesheet — every project as a row, Mon–Sun as
// columns, everyone's hours visible to everyone (this replaced an earlier
// version that posted hour reports as chat messages: those scrolled away
// and only a director/PM's own admin page could review them; this table
// just sits in the workspace, always current, nothing to scroll past).
// Each cell aggregates every staff member's hours for that project/day —
// hover the number to see the breakdown — and can only be edited for your
// own contribution; the project's own weekly_hour_cap fills a progress bar
// summed across everyone working that project.
export function HourTimesheet({
  initialReports,
  channels,
  staff,
  currentUserId,
  isHrManager,
}: {
  initialReports: HourReport[];
  channels: MeetingChannelPublic[];
  staff: Profile[];
  currentUserId: string;
  isHrManager: boolean;
}) {
  const [weekStart, setWeekStart] = useState(mondayOf(vnToday()));
  const [reports, setReports] = useState(initialReports);
  const [caps, setCaps] = useState<Record<string, number | null>>(
    () => Object.fromEntries(channels.map((c) => [c.id, c.weekly_hour_cap])),
  );
  const [loading, setLoading] = useState(false);
  const [editingEntry, setEditingEntry] = useState<{ project: MeetingChannelPublic; date: string } | null>(null);
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryDeleting, setEntryDeleting] = useState(false);
  const [editingCap, setEditingCap] = useState<string | null>(null);
  const [capValue, setCapValue] = useState("");
  // project: null means this is the "today" column-header info popup
  // rather than a specific project/day cell's entries.
  const [peek, setPeek] = useState<{ project: MeetingChannelPublic | null; date: string; rect: DOMRect; via: "hover" | "touch" } | null>(
    null,
  );
  const hoverTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  function clearHoverTimer() {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // A short grace period rather than closing the instant the mouse leaves
  // the cell — otherwise moving the cursor up into the popup itself (to
  // read a long note, say) would close it before it could be reached.
  function scheduleClose() {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setPeek(null), 150);
  }

  function cancelClose() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  const days = weekDaysOf(weekStart);
  const today = vnToday();
  const isCurrentWeek = weekStart === mondayOf(today);
  const staffById = useMemo(() => new Map(staff.map((p) => [p.id, p])), [staff]);
  const projects = useMemo(
    () => channels.filter((c) => !c.is_general && !c.is_food_room && c.billing_type === "hourly"),
    [channels],
  );

  async function goToWeek(newStart: string) {
    setWeekStart(newStart);
    setLoading(true);
    try {
      setReports(await listWeekHourReports(newStart));
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  function reportsFor(channelId: string, date: string) {
    return reports.filter((r) => r.project_channel_id === channelId && r.work_date === date);
  }

  function weekTotalFor(channelId: string) {
    return sumHM(reports.filter((r) => r.project_channel_id === channelId));
  }

  async function saveEntry(hours: number, minutes: number, note: string): Promise<string | void> {
    if (!editingEntry) return;
    const { project, date } = editingEntry;
    const mine = reportsFor(project.id, date).find((r) => r.profile_id === currentUserId);
    if (!(hours >= 0 && hours <= 24)) return "Nhập số giờ hợp lệ (0 – 24).";
    if (!(minutes >= 0 && minutes <= 59)) return "Nhập số phút hợp lệ (0 – 59).";
    if (hours * 60 + minutes <= 0) return "Nhập số giờ hợp lệ.";

    setEntrySaving(true);
    try {
      const saved = await logHours({ projectChannelId: project.id, workDate: date, hours, minutes, note });
      setReports((prev) => (mine ? prev.map((r) => (r.id === mine.id ? saved : r)) : [...prev, saved]));
      setEditingEntry(null);
    } catch (err) {
      return err instanceof Error ? err.message : "Có lỗi xảy ra";
    } finally {
      setEntrySaving(false);
    }
  }

  async function deleteEntry(): Promise<string | void> {
    if (!editingEntry) return;
    const { project, date } = editingEntry;
    const mine = reportsFor(project.id, date).find((r) => r.profile_id === currentUserId);
    if (!mine) return;

    setEntryDeleting(true);
    try {
      await deleteHourEntry(mine.id);
      setReports((prev) => prev.filter((r) => r.id !== mine.id));
      setEditingEntry(null);
    } catch (err) {
      return err instanceof Error ? err.message : "Có lỗi xảy ra";
    } finally {
      setEntryDeleting(false);
    }
  }

  async function commitCap(channelId: string) {
    setEditingCap(null);
    const trimmed = capValue.trim();
    const parsed = trimmed ? Number(capValue.replace(",", ".")) : null;
    if (parsed !== null && !(parsed > 0 && parsed <= 999)) return;
    const prevCap = caps[channelId] ?? null;
    setCaps((prev) => ({ ...prev, [channelId]: parsed }));
    try {
      await setProjectWeeklyCap(channelId, parsed);
    } catch {
      setCaps((prev) => ({ ...prev, [channelId]: prevCap }));
    }
  }

  const editingEntries = editingEntry ? reportsFor(editingEntry.project.id, editingEntry.date) : [];
  const editingMine = editingEntries.find((r) => r.profile_id === currentUserId) ?? null;
  const editingOthers = editingEntries
    .filter((r) => r.profile_id !== currentUserId)
    .map((r) => ({ profile: staffById.get(r.profile_id), hours: r.hours, minutes: r.minutes, note: r.note }))
    .filter((e): e is { profile: Profile; hours: number; minutes: number; note: string | null } => !!e.profile);

  return (
    <div className="flex-1 flex flex-col p-3 md:p-6 gap-4 md:gap-5 overflow-y-auto">
      <div>
        <h1 className="text-xl">Báo cáo giờ</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Bấm vào một ô để nhập giờ và nội dung công việc. Muốn xem nhanh: rê chuột vào ô (máy tính) hoặc bấm giữ (iPad/điện thoại).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => goToWeek(addDays(weekStart, -7))} className="btn-icon" aria-label="Tuần trước">
          ←
        </button>
        <span className="text-sm font-bold">
          {formatDayLabel(weekStart)} – {formatDayLabel(days[6])}
        </span>
        <button type="button" onClick={() => goToWeek(addDays(weekStart, 7))} className="btn-icon" aria-label="Tuần sau">
          →
        </button>
        {!isCurrentWeek && (
          <button type="button" onClick={() => goToWeek(mondayOf(vnToday()))} className="btn btn-ghost btn-sm">
            Tuần này
          </button>
        )}
      </div>

      {/* Dự án column stays pinned (position: sticky) while the rest of the
          table scrolls horizontally underneath it — on iPad/phone this is
          the difference between always knowing which row you're on and
          having to scroll back left every time to check. */}
      <div style={{ opacity: loading ? 0.6 : 1 }} className="card overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
              <th
                className="text-left px-2 md:px-3 py-2 text-[11px] font-bold"
                style={{ color: "var(--color-neutral-500)", position: "sticky", left: 0, background: "var(--color-panel)", zIndex: 2 }}
              >
                Dự án
              </th>
              {days.map((date, i) => {
                const isToday = date === today;
                return (
                  <th
                    key={date}
                    onClick={() => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isToday) return;
                      cancelClose();
                      const rect = e.currentTarget.getBoundingClientRect();
                      clearHoverTimer();
                      hoverTimerRef.current = window.setTimeout(() => {
                        cancelClose();
                        setPeek({ project: null, date, rect, via: "hover" });
                      }, 300);
                    }}
                    onMouseLeave={() => {
                      clearHoverTimer();
                      scheduleClose();
                    }}
                    onTouchStart={(e) => {
                      if (!isToday) return;
                      const touch = e.touches[0];
                      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
                      const rect = e.currentTarget.getBoundingClientRect();
                      clearLongPressTimer();
                      longPressTimerRef.current = window.setTimeout(() => {
                        suppressClickRef.current = true;
                        setPeek({ project: null, date, rect, via: "touch" });
                      }, 450);
                    }}
                    onTouchMove={(e) => {
                      const start = touchStartRef.current;
                      const touch = e.touches[0];
                      if (start && (Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10)) {
                        clearLongPressTimer();
                      }
                    }}
                    onTouchEnd={clearLongPressTimer}
                    className="text-center px-1 md:px-2 py-2 text-[11px] font-bold"
                    style={{
                      color: isToday ? "var(--color-accent-700)" : "var(--color-neutral-500)",
                      minWidth: 48,
                      background: isToday ? "var(--color-accent-100)" : undefined,
                      cursor: isToday ? "pointer" : undefined,
                      WebkitUserSelect: "none",
                      userSelect: "none",
                      WebkitTouchCallout: "none",
                    }}
                  >
                    {WEEKDAYS_SHORT[i]}
                    <br />
                    {formatDayLabel(date)}
                  </th>
                );
              })}
              <th className="text-center px-2 md:px-3 py-2 text-[11px] font-bold" style={{ color: "var(--color-neutral-500)", minWidth: 56 }}>
                Tổng
              </th>
              <th className="text-center px-2 md:px-3 py-2 text-[11px] font-bold" style={{ color: "var(--color-neutral-500)", minWidth: 100 }}>
                Tối đa/tuần
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-sm" style={{ color: "var(--color-neutral-500)" }}>
                  Chưa có dự án nào được đánh dấu &quot;Theo giờ&quot; — vào phòng họp, mở &quot;Thông tin phòng&quot; để chọn.
                </td>
              </tr>
            ) : (
              projects.map((project) => {
                const weekTotal = weekTotalFor(project.id);
                const weekTotalMinutes = weekTotal.hours * 60 + weekTotal.minutes;
                const cap = caps[project.id] ?? null;
                const capMinutes = cap ? Math.round(cap * 60) : 0;
                const pct = capMinutes ? Math.min(100, (weekTotalMinutes / capMinutes) * 100) : 0;
                const overCap = cap !== null && weekTotalMinutes > capMinutes;
                return (
                  <tr key={project.id} style={{ borderBottom: "1px solid var(--color-neutral-100)" }}>
                    <td
                      className="px-2 md:px-3 py-2 truncate max-w-[130px] md:max-w-[180px]"
                      style={{ position: "sticky", left: 0, background: "var(--color-panel)", zIndex: 1 }}
                    >
                      {project.icon} {project.name}
                    </td>
                    {days.map((date) => {
                      const entries = reportsFor(project.id, date);
                      const total = sumHM(entries);
                      const mine = entries.some((r) => r.profile_id === currentUserId);

                      function showPeek(rect: DOMRect, via: "hover" | "touch") {
                        if (entries.length === 0) return;
                        cancelClose();
                        setPeek({ project, date, rect, via });
                      }

                      return (
                        <td
                          key={date}
                          onClick={() => {
                            if (suppressClickRef.current) {
                              suppressClickRef.current = false;
                              return;
                            }
                            setPeek(null);
                            setEditingEntry({ project, date });
                          }}
                          onMouseEnter={(e) => {
                            cancelClose();
                            const rect = e.currentTarget.getBoundingClientRect();
                            clearHoverTimer();
                            hoverTimerRef.current = window.setTimeout(() => showPeek(rect, "hover"), 300);
                          }}
                          onMouseLeave={() => {
                            clearHoverTimer();
                            scheduleClose();
                          }}
                          onTouchStart={(e) => {
                            const touch = e.touches[0];
                            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
                            const rect = e.currentTarget.getBoundingClientRect();
                            clearLongPressTimer();
                            longPressTimerRef.current = window.setTimeout(() => {
                              suppressClickRef.current = true;
                              showPeek(rect, "touch");
                            }, 450);
                          }}
                          onTouchMove={(e) => {
                            const start = touchStartRef.current;
                            const touch = e.touches[0];
                            if (start && (Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10)) {
                              clearLongPressTimer();
                            }
                          }}
                          onTouchEnd={clearLongPressTimer}
                          className="px-1 py-2 text-center cursor-pointer"
                          style={{
                            WebkitUserSelect: "none",
                            userSelect: "none",
                            WebkitTouchCallout: "none",
                            background: date === today ? "var(--color-accent-100)" : undefined,
                          }}
                        >
                          {entries.length === 0 ? (
                            <span style={{ color: "var(--color-neutral-300)" }}>–</span>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="flex items-center justify-center">
                                {entries.map((r, i) => {
                                  const person = staffById.get(r.profile_id);
                                  const isMe = r.profile_id === currentUserId;
                                  return person ? (
                                    <div
                                      key={r.id}
                                      style={{
                                        marginLeft: i === 0 ? 0 : -7,
                                        borderRadius: "50%",
                                        border: `1.5px solid ${isMe ? "var(--color-accent-500)" : "var(--color-surface)"}`,
                                        zIndex: entries.length - i,
                                      }}
                                    >
                                      <AttendanceAvatar profile={person} size={16} />
                                    </div>
                                  ) : null;
                                })}
                              </div>
                              <span className="text-xs" style={{ fontWeight: mine ? 700 : 400 }}>
                                {formatHM(total.hours, total.minutes)}
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 md:px-3 py-2 text-center font-bold whitespace-nowrap">
                      {weekTotalMinutes ? formatHM(weekTotal.hours, weekTotal.minutes) : "–"}
                    </td>
                    <td className="px-2 md:px-3 py-2">
                      <div className="flex flex-col gap-1 items-center">
                        {isHrManager && editingCap === project.id ? (
                          <input
                            autoFocus
                            type="text"
                            inputMode="decimal"
                            className="input text-center"
                            style={{ width: 52, padding: "2px 4px" }}
                            value={capValue}
                            onChange={(e) => setCapValue(e.target.value)}
                            onBlur={() => commitCap(project.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") setEditingCap(null);
                            }}
                          />
                        ) : (
                          <span
                            className="text-xs font-semibold"
                            style={{ cursor: isHrManager ? "pointer" : "default" }}
                            onClick={() => {
                              if (!isHrManager) return;
                              setEditingCap(project.id);
                              setCapValue(cap !== null ? String(cap) : "");
                            }}
                          >
                            {cap !== null ? `${cap}h/tuần` : isHrManager ? "+ Đặt giờ" : "—"}
                          </span>
                        )}
                        {cap !== null && (
                          <div className="rounded-full overflow-hidden w-full" style={{ height: 6, background: "var(--color-neutral-100)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: overCap ? "var(--status-red)" : "var(--status-green)",
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {peek && (
        <div onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          {peek.project ? (
            <CellPeekPopup
              rect={peek.rect}
              projectLabel={`${peek.project.icon} ${peek.project.name}`}
              date={peek.date}
              entries={reportsFor(peek.project.id, peek.date)
                .map((r) => ({ profile: staffById.get(r.profile_id), hours: r.hours, minutes: r.minutes, note: r.note }))
                .filter((e): e is { profile: Profile; hours: number; minutes: number; note: string | null } => !!e.profile)}
              dismissOnBackdrop={peek.via === "touch"}
              onClose={() => setPeek(null)}
            />
          ) : (
            <TodayInfoPopup rect={peek.rect} date={peek.date} dismissOnBackdrop={peek.via === "touch"} onClose={() => setPeek(null)} />
          )}
        </div>
      )}

      {editingEntry && (
        <HourEntryModal
          projectLabel={`${editingEntry.project.icon} ${editingEntry.project.name}`}
          date={editingEntry.date}
          otherEntries={editingOthers}
          initialHours={editingMine?.hours ?? 0}
          initialMinutes={editingMine?.minutes ?? 0}
          initialNote={editingMine?.note ?? ""}
          hasExisting={!!editingMine}
          saving={entrySaving}
          deleting={entryDeleting}
          onSave={saveEntry}
          onDelete={deleteEntry}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  );
}
