"use client";

import { useState } from "react";
import { listMyAttendance } from "@/lib/actions/attendance";
import {
  WEEKDAYS_FULL,
  WORK_HOURS_LABEL,
  addDays,
  formatCheckInTime,
  formatDayLabel,
  isLateCheckIn,
  isMonToFri,
  mondayOf,
  vnToday,
  weekDaysOf,
} from "@/lib/constants/attendance";
import type { AttendanceEntry } from "@/lib/types";

export function MyAttendance({ initialEntries }: { initialEntries: AttendanceEntry[] }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(vnToday()));
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);

  const today = vnToday();
  const days = weekDaysOf(weekStart);
  const byDate = new Map(entries.map((e) => [e.work_date, e]));

  async function goToWeek(newStart: string) {
    setWeekStart(newStart);
    setLoading(true);
    try {
      setEntries(await listMyAttendance(newStart));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">
      <div>
        <h1 className="text-xl">Chấm công</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Giờ vào làm được tự động ghi nhận theo lần đăng nhập đầu tiên trong ngày. Giờ làm việc: {WORK_HOURS_LABEL}.
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

      <div className="card elev-sm overflow-hidden" style={{ opacity: loading ? 0.6 : 1 }}>
        {days.map((date, i) => {
          const entry = byDate.get(date);
          const isToday = date === today;
          const isFuture = date > today;
          const weekday = isMonToFri(date);
          return (
            <div
              key={date}
              className="flex items-center gap-4 px-4 py-3"
              style={{
                borderBottom: i < 6 ? "1px solid var(--color-neutral-200)" : "none",
                background: isToday ? "var(--color-accent-100)" : undefined,
              }}
            >
              <div className="flex flex-col" style={{ width: 90 }}>
                <span className="text-sm font-bold">{WEEKDAYS_FULL[i]}</span>
                <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                  {formatDayLabel(date)}
                </span>
              </div>
              <div className="flex-1">
                {entry?.status === "leave" ? (
                  <span className="tag tag-neutral">Nghỉ phép</span>
                ) : entry?.status === "absent" ? (
                  <span className="text-xs font-bold" style={{ color: "var(--status-red)" }}>
                    Vắng
                  </span>
                ) : entry?.check_in_at ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold">🕐 {formatCheckInTime(entry.check_in_at)}</span>
                    {weekday &&
                      (isLateCheckIn(entry.check_in_at) ? (
                        <span className="text-[11px] font-bold" style={{ color: "var(--status-yellow)" }}>
                          Trễ
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold" style={{ color: "var(--status-green)" }}>
                          Đúng giờ
                        </span>
                      ))}
                  </span>
                ) : isFuture ? (
                  <span className="text-xs" style={{ color: "var(--color-neutral-400)" }}>
                    —
                  </span>
                ) : !weekday ? (
                  <span className="text-xs" style={{ color: "var(--color-neutral-400)" }}>
                    Ngày nghỉ
                  </span>
                ) : (
                  <span className="text-xs font-bold" style={{ color: "var(--color-neutral-400)" }}>
                    Chưa vào làm
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
