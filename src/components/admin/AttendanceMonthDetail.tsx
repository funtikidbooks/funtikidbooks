"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { getMonthAttendance, listOffDates } from "@/lib/actions/attendance";
import { AttendanceAvatar, AttendanceEditCellModal } from "@/components/admin/AttendanceEditCellModal";
import {
  MONTH_LABELS,
  WEEKDAYS_SHORT,
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
import type { AttendanceEntry, Profile } from "@/lib/types";

export function AttendanceMonthDetail({
  profile,
  initialEntries,
  initialOffDates,
  initialMonthStart,
  onClose,
}: {
  profile: Profile;
  initialEntries: AttendanceEntry[];
  initialOffDates: string[];
  initialMonthStart: string;
  onClose: () => void;
}) {
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [entries, setEntries] = useState(initialEntries);
  const [offDates, setOffDates] = useState(initialOffDates);
  const offDateSet = useMemo(() => new Set(offDates), [offDates]);
  const [loading, setLoading] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const today = vnToday();
  const byDate = useMemo(() => new Map(entries.map((e) => [e.work_date, e])), [entries]);

  const stats = useMemo(() => summarizeAttendance(entries), [entries]);

  async function goToMonth(newStart: string) {
    setMonthStart(newStart);
    setLoading(true);
    try {
      const [monthEntries, monthOffDates] = await Promise.all([
        getMonthAttendance(profile.id, newStart),
        listOffDates(newStart),
      ]);
      setEntries(monthEntries);
      setOffDates(monthOffDates);
    } catch {
      setEntries([]);
      setOffDates([]);
    } finally {
      setLoading(false);
    }
  }

  const d = new Date(`${monthStart}T00:00:00`);
  const monthLabel = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
  const dates = monthGridDates(monthStart);

  return (
    <>
      <Modal onClose={onClose} maxWidth={680}>
        <div className="flex flex-col">
          <div className="flex items-center gap-3 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
            <AttendanceAvatar profile={profile} size={36} />
            <div className="flex-1">
              <h2 className="text-lg">{profile.display_name}</h2>
              <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                {profile.role || (profile.access_role === "admin" ? "Admin" : "Nhân viên")}
              </p>
            </div>
            <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="grid grid-cols-4 gap-3">
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
              <span className="text-sm font-bold flex-1">{monthLabel}</span>
              <button type="button" onClick={() => goToMonth(addMonths(monthStart, 1))} className="btn-icon" aria-label="Tháng sau">
                →
              </button>
              {monthStart !== firstOfMonth(vnToday()) && (
                <button type="button" onClick={() => goToMonth(firstOfMonth(vnToday()))} className="btn btn-ghost btn-sm">
                  Tháng này
                </button>
              )}
            </div>

            <div style={{ opacity: loading ? 0.6 : 1 }}>
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
                  const weekday = isMonToFri(date) && !offDateSet.has(date);

                  let badge: React.ReactNode = null;
                  if (entry?.status === "off") {
                    badge = <span style={{ color: "var(--color-neutral-400)" }}>Ngày nghỉ</span>;
                  } else if (entry?.status === "paid_leave") {
                    badge = <span style={{ color: "var(--status-blue)" }}>Nghỉ lương</span>;
                  } else if (entry?.status === "leave") {
                    badge = <span style={{ color: "var(--color-neutral-500)" }}>Nghỉ</span>;
                  } else if (entry?.status === "absent") {
                    badge = <span style={{ color: "var(--status-red)" }}>Vắng</span>;
                  } else if (entry?.check_in_at) {
                    const late = isLateCheckIn(entry.check_in_at);
                    badge = (
                      <span style={{ color: late ? "var(--status-yellow)" : "var(--status-green)" }}>
                        {formatCheckInTime(entry.check_in_at)}
                      </span>
                    );
                  } else if (inMonth && !isFuture && weekday) {
                    badge = <span style={{ color: "var(--color-neutral-400)" }}>·</span>;
                  }

                  return (
                    <button
                      type="button"
                      key={date}
                      onClick={() => inMonth && setEditingDate(date)}
                      disabled={!inMonth}
                      className="flex flex-col items-center justify-center rounded-[8px] py-2 gap-0.5"
                      style={{
                        background: isToday ? "var(--color-accent-100)" : "transparent",
                        opacity: inMonth ? 1 : 0.3,
                        cursor: inMonth ? "pointer" : "default",
                        minHeight: 46,
                      }}
                    >
                      <span className="text-[11px] font-semibold">{Number(date.slice(8, 10))}</span>
                      <span className="text-[10px] font-bold">{badge}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {editingDate && (
        <AttendanceEditCellModal
          profile={profile}
          date={editingDate}
          entry={byDate.get(editingDate)}
          onClose={() => setEditingDate(null)}
          onSaved={(entry) => {
            setEntries((prev) => {
              const idx = prev.findIndex((e) => e.work_date === entry.work_date);
              if (idx === -1) return [...prev, entry];
              return prev.map((e, i) => (i === idx ? entry : e));
            });
          }}
          onDeleted={(workDate) => {
            setEntries((prev) => prev.filter((e) => e.work_date !== workDate));
          }}
        />
      )}
    </>
  );
}
