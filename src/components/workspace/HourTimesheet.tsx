"use client";

import { useMemo, useState } from "react";
import { deleteHourEntry, listWeekHourReports, logHours, setProjectWeeklyCap } from "@/lib/actions/hourReports";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { WEEKDAYS_SHORT, addDays, formatDayLabel, mondayOf, vnToday, weekDaysOf } from "@/lib/constants/attendance";
import type { HourReport, MeetingChannelPublic, Profile } from "@/lib/types";

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
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingCap, setEditingCap] = useState<string | null>(null);
  const [capValue, setCapValue] = useState("");

  const days = weekDaysOf(weekStart);
  const isCurrentWeek = weekStart === mondayOf(vnToday());
  const staffById = useMemo(() => new Map(staff.map((p) => [p.id, p])), [staff]);
  const projects = useMemo(() => channels.filter((c) => !c.is_general && !c.is_food_room), [channels]);

  async function goToWeek(newStart: string) {
    setWeekStart(newStart);
    setEditingCell(null);
    setLoading(true);
    try {
      setReports(await listWeekHourReports(newStart));
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  function cellKey(channelId: string, date: string) {
    return `${channelId}-${date}`;
  }

  function reportsFor(channelId: string, date: string) {
    return reports.filter((r) => r.project_channel_id === channelId && r.work_date === date);
  }

  function weekTotalFor(channelId: string) {
    return reports.filter((r) => r.project_channel_id === channelId).reduce((sum, r) => sum + r.hours, 0);
  }

  function startEditingCell(channelId: string, date: string) {
    const mine = reportsFor(channelId, date).find((r) => r.profile_id === currentUserId);
    setEditingCap(null);
    setEditingCell(cellKey(channelId, date));
    setEditingValue(mine ? String(mine.hours) : "");
  }

  async function commitCell(channelId: string, date: string) {
    const key = cellKey(channelId, date);
    setEditingCell(null);
    const mine = reportsFor(channelId, date).find((r) => r.profile_id === currentUserId);
    const parsed = Number(editingValue.replace(",", "."));

    if (!editingValue.trim() || !(parsed > 0)) {
      if (!mine) return;
      setReports((prev) => prev.filter((r) => r.id !== mine.id));
      try {
        await deleteHourEntry(mine.id);
      } catch {
        setReports((prev) => (prev.some((r) => r.id === mine.id) ? prev : [...prev, mine]));
      }
      return;
    }

    if (!(parsed > 0 && parsed <= 24)) return;

    const optimistic: HourReport = {
      id: mine?.id ?? `temp-${key}`,
      profile_id: currentUserId,
      project_channel_id: channelId,
      work_date: date,
      hours: parsed,
      note: null,
      created_at: mine?.created_at ?? new Date().toISOString(),
    };
    setReports((prev) => (mine ? prev.map((r) => (r.id === mine.id ? optimistic : r)) : [...prev, optimistic]));
    try {
      const saved = await logHours({ projectChannelId: channelId, workDate: date, hours: parsed });
      setReports((prev) => prev.map((r) => (r.id === optimistic.id ? saved : r)));
    } catch {
      setReports((prev) => (mine ? prev.map((r) => (r.id === optimistic.id ? mine : r)) : prev.filter((r) => r.id !== optimistic.id)));
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

  return (
    <div className="flex-1 flex flex-col p-3 md:p-6 gap-4 md:gap-5 overflow-y-auto">
      <div>
        <h1 className="text-xl">Báo cáo giờ</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Bấm vào một ô để nhập giờ của bạn — mọi người đều thấy avatar ai đã báo giờ. Di chuột vào để xem chi tiết từng người.
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
                      const key = cellKey(project.id, date);
                      const entries = reportsFor(project.id, date);
                      const total = entries.reduce((sum, r) => sum + r.hours, 0);
                      const breakdown = entries
                        .map((r) => `${staffById.get(r.profile_id)?.display_name ?? "?"}: ${r.hours}h`)
                        .join(", ");
                      const mine = entries.some((r) => r.profile_id === currentUserId);

                      if (editingCell === key) {
                        return (
                          <td key={date} className="px-1 py-1 text-center">
                            <input
                              autoFocus
                              type="text"
                              inputMode="decimal"
                              className="input text-center"
                              style={{ width: 44, padding: "4px 2px" }}
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => commitCell(project.id, date)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                            />
                          </td>
                        );
                      }
                      return (
                        <td
                          key={date}
                          onClick={() => startEditingCell(project.id, date)}
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
                              setEditingCell(null);
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
    </div>
  );
}
