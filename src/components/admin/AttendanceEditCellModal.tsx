"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { upsertAttendance } from "@/lib/actions/attendance";
import { formatCheckInTime, formatDayLabel } from "@/lib/constants/attendance";
import type { AttendanceEntry, Profile } from "@/lib/types";

export function AttendanceAvatar({ profile, size = 26 }: { profile: Profile; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold flex-none overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.42, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
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

export function AttendanceEditCellModal({
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
