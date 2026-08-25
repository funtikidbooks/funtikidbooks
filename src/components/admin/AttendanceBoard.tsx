"use client";

import { useMemo, useState } from "react";
import { getMonthAttendance, listAllAttendance } from "@/lib/actions/attendance";
import { AttendanceAvatar, AttendanceEditCellModal } from "@/components/admin/AttendanceEditCellModal";
import { AttendanceMonthDetail } from "@/components/admin/AttendanceMonthDetail";
import {
  WEEKDAYS_SHORT,
  WORK_HOURS_LABEL,
  addDays,
  firstOfMonth,
  formatCheckInTime,
  formatDayLabel,
  isLateCheckIn,
  isMonToFri,
  mondayOf,
  vnToday,
  weekDaysOf,
} from "@/lib/constants/attendance";
import type { AttendanceEntry, Profile } from "@/lib/types";

export function AttendanceBoard({
  initialEntries,
  staff,
}: {
  initialEntries: AttendanceEntry[];
  staff: Profile[];
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(vnToday()));
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ profile: Profile; date: string } | null>(null);
  const [detail, setDetail] = useState<{ profile: Profile; entries: AttendanceEntry[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const today = vnToday();
  const days = weekDaysOf(weekStart);

  const byKey = useMemo(() => {
    const map = new Map<string, AttendanceEntry>();
    for (const e of entries) map.set(`${e.profile_id}-${e.work_date}`, e);
    return map;
  }, [entries]);

  async function goToWeek(newStart: string) {
    setWeekStart(newStart);
    setLoading(true);
    try {
      setEntries(await listAllAttendance(newStart));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSaved(entry: AttendanceEntry) {
    setEntries((prev) => {
      const key = `${entry.profile_id}-${entry.work_date}`;
      const idx = prev.findIndex((e) => `${e.profile_id}-${e.work_date}` === key);
      if (idx === -1) return [...prev, entry];
      return prev.map((e, i) => (i === idx ? entry : e));
    });
  }

  async function openDetail(profile: Profile) {
    setDetailLoading(profile.id);
    try {
      const monthEntries = await getMonthAttendance(profile.id, firstOfMonth(vnToday()));
      setDetail({ profile, entries: monthEntries });
    } catch {
      setDetail({ profile, entries: [] });
    } finally {
      setDetailLoading(null);
    }
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">
      <div>
        <h1 className="text-xl">Chấm công</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Giờ vào làm ghi nhận tự động theo lần đăng nhập đầu tiên trong ngày của từng nhân viên. Giờ làm việc: {WORK_HOURS_LABEL}. Bấm vào một ô để chỉnh sửa thủ công.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => goToWeek(addDays(weekStart, -7))} className="btn-icon" aria-label="Tuần trước">
          ←
        </button>
        <span className="text-sm font-bold">
          Tuần {formatDayLabel(days[0])} – {formatDayLabel(days[6])}
        </span>
        <button type="button" onClick={() => goToWeek(addDays(weekStart, 7))} className="btn-icon" aria-label="Tuần sau">
          →
        </button>
        {weekStart !== mondayOf(vnToday()) && (
          <button type="button" onClick={() => goToWeek(mondayOf(vnToday()))} className="btn btn-ghost btn-sm">
            Tuần này
          </button>
        )}
      </div>

      {staff.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
          Chưa có nhân viên nào.
        </p>
      ) : (
        <div className="card elev-sm overflow-x-auto" style={{ opacity: loading ? 0.6 : 1 }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                <th className="text-left px-4 py-3 font-bold sticky left-0" style={{ background: "var(--color-panel)" }}>
                  Nhân viên
                </th>
                {days.map((date, i) => (
                  <th key={date} className="text-center px-3 py-3 font-bold" style={{ minWidth: 90 }}>
                    <div>{WEEKDAYS_SHORT[i]}</div>
                    <div className="text-[11px] font-normal" style={{ color: "var(--color-neutral-500)" }}>
                      {formatDayLabel(date)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                  <td className="px-4 py-2.5 sticky left-0" style={{ background: "var(--color-panel)" }}>
                    <button
                      type="button"
                      onClick={() => openDetail(p)}
                      className="flex items-center gap-2 text-left"
                      title="Xem chi tiết chấm công theo tháng"
                    >
                      <AttendanceAvatar profile={p} />
                      <span className="font-semibold truncate" style={{ maxWidth: 140 }}>
                        {p.display_name}
                      </span>
                      {detailLoading === p.id && <span className="text-xs">…</span>}
                    </button>
                  </td>
                  {days.map((date) => {
                    const entry = byKey.get(`${p.id}-${date}`);
                    const isFuture = date > today;
                    const weekday = isMonToFri(date);
                    return (
                      <td
                        key={date}
                        className="text-center px-3 py-2.5 cursor-pointer"
                        onClick={() => setEditing({ profile: p, date })}
                        title="Bấm để chỉnh sửa"
                      >
                        {entry?.status === "leave" ? (
                          <span className="text-[11px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
                            Nghỉ phép
                          </span>
                        ) : entry?.status === "absent" ? (
                          <span className="text-[11px] font-bold" style={{ color: "var(--status-red)" }}>
                            Vắng
                          </span>
                        ) : entry?.check_in_at ? (
                          <span
                            className="text-[13px] font-bold"
                            style={{
                              color:
                                weekday && isLateCheckIn(entry.check_in_at)
                                  ? "var(--status-yellow)"
                                  : "var(--status-green)",
                            }}
                          >
                            {formatCheckInTime(entry.check_in_at)}
                          </span>
                        ) : isFuture ? (
                          <span style={{ color: "var(--color-neutral-300)" }}>—</span>
                        ) : !weekday ? (
                          <span className="text-[11px]" style={{ color: "var(--color-neutral-300)" }}>
                            Nghỉ
                          </span>
                        ) : (
                          <span className="text-[11px]" style={{ color: "var(--color-neutral-400)" }}>
                            Chưa vào
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <AttendanceEditCellModal
          profile={editing.profile}
          date={editing.date}
          entry={byKey.get(`${editing.profile.id}-${editing.date}`)}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {detail && (
        <AttendanceMonthDetail
          profile={detail.profile}
          initialEntries={detail.entries}
          initialMonthStart={firstOfMonth(vnToday())}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
