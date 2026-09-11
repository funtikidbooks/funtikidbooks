"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { deleteHourEntry, listWeekHourReports, logHours, setProjectWeeklyCap } from "@/lib/actions/hourReports";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { WEEKDAYS_SHORT, addDays, formatDayLabel, mondayOf, vnToday, weekDaysOf } from "@/lib/constants/attendance";
import type { HourReport, MeetingChannelPublic, Profile } from "@/lib/types";

// A small modal rather than an inline table-cell input — a note textarea
// inline would force that one day-column wider across every row in the
// table. The cell itself stays a bare number; content only shows up here,
// opened by clicking the day.
function HourEntryModal({
  projectLabel,
  date,
  initialHours,
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
  initialHours: string;
  initialNote: string;
  hasExisting: boolean;
  saving: boolean;
  deleting: boolean;
  onSave: (hours: string, note: string) => Promise<string | void>;
  onDelete: () => Promise<string | void>;
  onClose: () => void;
}) {
  const [hours, setHours] = useState(initialHours);
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} maxWidth={360}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError((await onSave(hours, note)) || null);
        }}
        className="flex flex-col gap-4 p-6"
      >
        <div>
          <h2 className="text-lg">{projectLabel}</h2>
          <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            {formatDayLabel(date)}
          </p>
        </div>

        <div className="field">
          <label htmlFor="hr-hours">Số giờ</label>
          <input
            id="hr-hours"
            autoFocus
            type="text"
            inputMode="decimal"
            className="input"
            placeholder="vd. 5.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
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

  const days = weekDaysOf(weekStart);
  const isCurrentWeek = weekStart === mondayOf(vnToday());
  const staffById = useMemo(() => new Map(staff.map((p) => [p.id, p])), [staff]);
  const projects = useMemo(() => channels.filter((c) => !c.is_general && !c.is_food_room), [channels]);

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
    return reports.filter((r) => r.project_channel_id === channelId).reduce((sum, r) => sum + r.hours, 0);
  }

  async function saveEntry(hours: string, note: string): Promise<string | void> {
    if (!editingEntry) return;
    const { project, date } = editingEntry;
    const mine = reportsFor(project.id, date).find((r) => r.profile_id === currentUserId);
    const parsed = Number(hours.replace(",", "."));
    if (!(parsed > 0 && parsed <= 24)) return "Nhập số giờ hợp lệ (0 – 24).";

    setEntrySaving(true);
    try {
      const saved = await logHours({ projectChannelId: project.id, workDate: date, hours: parsed, note });
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

  const editingMine = editingEntry ? reportsFor(editingEntry.project.id, editingEntry.date).find((r) => r.profile_id === currentUserId) : null;

  return (
    <div className="flex-1 flex flex-col p-3 md:p-6 gap-4 md:gap-5 overflow-y-auto">
      <div>
        <h1 className="text-xl">Báo cáo giờ</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Bấm vào một ô để nhập giờ và nội dung công việc — mọi người đều thấy avatar ai đã báo giờ. Di chuột vào để xem chi tiết từng người.
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
              {days.map((date, i) => (
                <th
                  key={date}
                  className="text-center px-1 md:px-2 py-2 text-[11px] font-bold"
                  style={{ color: "var(--color-neutral-500)", minWidth: 48 }}
                >
                  {WEEKDAYS_SHORT[i]}
                  <br />
                  {formatDayLabel(date)}
                </th>
              ))}
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
                  Chưa có phòng dự án nào.
                </td>
              </tr>
            ) : (
              projects.map((project) => {
                const weekTotal = weekTotalFor(project.id);
                const cap = caps[project.id] ?? null;
                const pct = cap ? Math.min(100, (weekTotal / cap) * 100) : 0;
                const overCap = cap !== null && weekTotal > cap;
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
                      const total = entries.reduce((sum, r) => sum + r.hours, 0);
                      const breakdown = entries
                        .map((r) => {
                          const name = staffById.get(r.profile_id)?.display_name ?? "?";
                          return r.note ? `${name}: ${r.hours}h (${r.note})` : `${name}: ${r.hours}h`;
                        })
                        .join("\n");
                      const mine = entries.some((r) => r.profile_id === currentUserId);

                      return (
                        <td
                          key={date}
                          onClick={() => setEditingEntry({ project, date })}
                          title={breakdown || undefined}
                          className="px-1 py-2 text-center cursor-pointer"
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
                                {total}
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 md:px-3 py-2 text-center font-bold whitespace-nowrap">{weekTotal || "–"}</td>
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

      {editingEntry && (
        <HourEntryModal
          projectLabel={`${editingEntry.project.icon} ${editingEntry.project.name}`}
          date={editingEntry.date}
          initialHours={editingMine ? String(editingMine.hours) : ""}
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
