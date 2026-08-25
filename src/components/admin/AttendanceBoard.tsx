"use client";

import { useMemo, useState } from "react";
import { listAllAttendance, upsertAttendance } from "@/lib/actions/attendance";
import { Modal } from "@/components/ui/Modal";
import {
  WEEKDAYS_SHORT,
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
import type { AttendanceEntry, Profile } from "@/lib/types";

function Avatar({ profile }: { profile: Profile }) {
  return (
    <span
      className="flex items-center justify-center rounded-full text-[11px] font-bold flex-none overflow-hidden"
      style={{ width: 26, height: 26, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
    >
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        profile.display_name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

function EditCellModal({
  profile,
  date,
  entry,
  onClose,
  onSaved,
}: {
  profile: Profile;
  date: string;
  entry: AttendanceEntry | undefined;
  onClose: () => void;
  onSaved: (entry: AttendanceEntry) => void;
}) {
  const [status, setStatus] = useState<"present" | "absent" | "leave">(entry?.status ?? "present");
  const [checkInTime, setCheckInTime] = useState(entry?.check_in_at ? formatCheckInTime(entry.check_in_at) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertAttendance({
        profileId: profile.id,
        workDate: date,
        status,
        checkInTime: status === "present" && checkInTime ? checkInTime : undefined,
        note,
      });
      onSaved({
        id: entry?.id ?? `${profile.id}-${date}`,
        profile_id: profile.id,
        work_date: date,
        status,
        check_in_at:
          status === "present" && checkInTime
            ? new Date(`${date}T${checkInTime}:00+07:00`).toISOString()
            : status === "present"
              ? (entry?.check_in_at ?? null)
              : null,
        note: note.trim() || null,
        created_at: entry?.created_at ?? new Date().toISOString(),
      });
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
        <div>
          <h2 className="text-lg">{profile.display_name}</h2>
          <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Ngày {formatDayLabel(date)}
          </p>
        </div>

        <div className="field">
          <label>Trạng thái</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {([
              { value: "present", label: "Có mặt" },
              { value: "absent", label: "Vắng" },
              { value: "leave", label: "Nghỉ phép" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className="px-3 py-1.5 rounded-full text-sm font-semibold"
                style={{
                  background: status === opt.value ? "var(--color-accent-500)" : "var(--color-surface)",
                  color: status === opt.value ? "#fff" : "var(--color-text)",
                  border: `1.5px solid ${status === opt.value ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {status === "present" && (
          <div className="field">
            <label htmlFor="att-time">Giờ vào làm</label>
            <input
              id="att-time"
              type="time"
              className="input"
              value={checkInTime}
              onChange={(e) => setCheckInTime(e.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="att-note">Ghi chú</label>
          <input id="att-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
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
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

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
                    <div className="flex items-center gap-2">
                      <Avatar profile={p} />
                      <span className="font-semibold truncate" style={{ maxWidth: 140 }}>
                        {p.display_name}
                      </span>
                    </div>
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
        <EditCellModal
          profile={editing.profile}
          date={editing.date}
          entry={byKey.get(`${editing.profile.id}-${editing.date}`)}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
