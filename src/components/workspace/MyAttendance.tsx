"use client";

import { useMemo, useState } from "react";
import { listMyMonthAttendance } from "@/lib/actions/attendance";
import {
  MONTH_LABELS,
  WEEKDAYS_SHORT,
  WORK_HOURS_LABEL,
  addMonths,
  firstOfMonth,
  formatCheckInTime,
  isLateCheckIn,
  isMonToFri,
  isSameMonth,
  monthGridDates,
  summarizeAttendance,
  vnToday,
} from "@/lib/constants/attendance";
import type { AttendanceEntry } from "@/lib/types";

export function MyAttendance({ initialEntries }: { initialEntries: AttendanceEntry[] }) {
  const [monthStart, setMonthStart] = useState(() => firstOfMonth(vnToday()));
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);

  const today = vnToday();
  const byDate = useMemo(() => new Map(entries.map((e) => [e.work_date, e])), [entries]);
  const stats = useMemo(() => summarizeAttendance(entries), [entries]);

  async function goToMonth(newStart: string) {
    setMonthStart(newStart);
    setLoading(true);
    try {
      setEntries(await listMyMonthAttendance(newStart));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  const d = new Date(`${monthStart}T00:00:00`);
  const monthLabel = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
  const dates = monthGridDates(monthStart);

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">
      <div>
        <h1 className="text-xl">Chấm công</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Giờ vào làm được tự động ghi nhận theo lần đăng nhập đầu tiên trong ngày. Giờ làm việc: {WORK_HOURS_LABEL}.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3" style={{ maxWidth: 520 }}>
        <div className="card p-3 flex flex-col items-center gap-0.5" style={{ background: "var(--color-surface)" }}>
          <span className="text-xl font-bold" style={{ color: "var(--status-green)" }}>{stats.present}</span>
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>Ngày công</span>
        </div>
        <div className="card p-3 flex flex-col items-center gap-0.5" style={{ background: "var(--color-surface)" }}>
          <span className="text-xl font-bold" style={{ color: "var(--status-yellow)" }}>{stats.late}</span>
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>Đi trễ</span>
        </div>
        <div className="card p-3 flex flex-col items-center gap-0.5" style={{ background: "var(--color-surface)" }}>
          <span className="text-xl font-bold" style={{ color: "var(--status-red)" }}>{stats.absent}</span>
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>Vắng</span>
        </div>
        <div className="card p-3 flex flex-col items-center gap-0.5" style={{ background: "var(--color-surface)" }}>
          <span className="text-xl font-bold" style={{ color: "var(--color-neutral-600)" }}>{stats.leave}</span>
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>Nghỉ phép</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => goToMonth(addMonths(monthStart, -1))} className="btn-icon" aria-label="Tháng trước">
          ←
        </button>
        <span className="text-sm font-bold">{monthLabel}</span>
        <button type="button" onClick={() => goToMonth(addMonths(monthStart, 1))} className="btn-icon" aria-label="Tháng sau">
          →
        </button>
        {monthStart !== firstOfMonth(vnToday()) && (
          <button type="button" onClick={() => goToMonth(firstOfMonth(vnToday()))} className="btn btn-ghost btn-sm">
            Tháng này
          </button>
        )}
      </div>

      <div className="card elev-sm p-4" style={{ opacity: loading ? 0.6 : 1, maxWidth: 720 }}>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="text-center text-[11px] font-bold py-1" style={{ color: "var(--color-neutral-500)" }}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dates.map((date) => {
            const inMonth = isSameMonth(date, monthStart);
            const entry = byDate.get(date);
            const isToday = date === today;
            const isFuture = date > today;
            const weekday = isMonToFri(date);

            let badge: React.ReactNode = null;
            if (entry?.status === "leave") {
              badge = <span style={{ color: "var(--color-neutral-500)" }}>Nghỉ</span>;
            } else if (entry?.status === "absent") {
              badge = <span style={{ color: "var(--status-red)" }}>Vắng</span>;
            } else if (entry?.check_in_at) {
              const late = weekday && isLateCheckIn(entry.check_in_at);
              badge = (
                <span style={{ color: late ? "var(--status-yellow)" : "var(--status-green)" }}>
                  {formatCheckInTime(entry.check_in_at)}
                </span>
              );
            } else if (inMonth && !isFuture && weekday) {
              badge = <span style={{ color: "var(--color-neutral-400)" }}>Chưa vào làm</span>;
            } else if (inMonth && !weekday) {
              badge = <span style={{ color: "var(--color-neutral-400)" }}>Ngày nghỉ</span>;
            }

            return (
              <div
                key={date}
                title={entry?.note ?? undefined}
                className="flex flex-col items-center justify-center rounded-[8px] py-2 gap-0.5"
                style={{
                  background: isToday ? "var(--color-accent-100)" : "transparent",
                  opacity: inMonth ? 1 : 0.3,
                  minHeight: 54,
                }}
              >
                <span className="text-[11px] font-semibold">{Number(date.slice(8, 10))}</span>
                <span className="text-[10px] font-bold text-center" style={{ lineHeight: 1.3 }}>
                  {badge}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
