"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { deleteAttendance, upsertAttendance } from "@/lib/actions/attendance";
import { thumbnailUrl } from "@/lib/imageTransform";
import { DEFAULT_OVERTIME_START, formatCheckInTime, formatDayLabel, isDefaultWorkDay } from "@/lib/constants/attendance";
import type { AttendanceEntry, Profile } from "@/lib/types";

export function AttendanceAvatar({ profile, size = 26 }: { profile: Profile; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold flex-none overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.42, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
    >
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl(profile.avatar_url, Math.max(size * 2, 64))} alt="" className="w-full h-full object-cover" />
      ) : (
        profile.display_name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

// How a tăng ca day reads in every attendance calendar — accent orange so it
// stands apart from ordinary green/yellow check-ins.
export function OvertimeBadge({ entry }: { entry: AttendanceEntry }) {
  return (
    <span className="flex flex-col items-center leading-tight" style={{ color: "var(--color-accent-600)" }}>
      <span>{entry.status === "half_day" ? "Tăng ca ½" : "Tăng ca"}</span>
      {entry.check_in_at && <span className="font-semibold">{formatCheckInTime(entry.check_in_at)}</span>}
    </span>
  );
}

// "Ngày nghỉ theo Lịch" / "Chủ nhật" when `date` is off by default — the
// label the tăng ca editor shows, or null for an ordinary work day.
export function offDayLabel(date: string, offDateSet: Set<string>): string | null {
  if (offDateSet.has(date)) return "Ngày nghỉ theo Lịch";
  if (!isDefaultWorkDay(date)) return "Chủ nhật — ngày nghỉ";
  return null;
}

type OffDayChoice = "off" | "full" | "half";

// A day that's off by default (calendar "Ngày nghỉ" or Sunday): the only
// real question is whether this person came in for tăng ca — so ask just
// that, instead of the full status list meant for ordinary work days.
function OffDayEditor({
  profile,
  date,
  entry,
  offLabel,
  onClose,
  onSaved,
  onDeleted,
}: {
  profile: Profile;
  date: string;
  entry: AttendanceEntry | undefined;
  offLabel: string;
  onClose: () => void;
  onSaved: (entry: AttendanceEntry) => void;
  onDeleted?: (workDate: string) => void;
}) {
  const [choice, setChoice] = useState<OffDayChoice>(entry?.overtime ? (entry.status === "half_day" ? "half" : "full") : "off");
  const [checkInTime, setCheckInTime] = useState(
    entry?.overtime && entry.check_in_at ? formatCheckInTime(entry.check_in_at) : DEFAULT_OVERTIME_START,
  );
  const [note, setNote] = useState(entry?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (choice === "off") {
        // Back to the calendar's default — no row at all, same as never edited.
        if (entry) {
          await deleteAttendance(profile.id, date);
          onDeleted?.(date);
        }
        onClose();
        return;
      }
      const status = choice === "full" ? "present" : "half_day";
      const time = checkInTime.trim();
      await upsertAttendance({ profileId: profile.id, workDate: date, status, checkInTime: time || undefined, note, overtime: true });
      onSaved({
        id: entry?.id ?? `${profile.id}-${date}`,
        profile_id: profile.id,
        work_date: date,
        status,
        check_in_at: time ? new Date(`${date}T${time}:00+07:00`).toISOString() : null,
        note: note.trim() || null,
        overtime: true,
        created_at: entry?.created_at ?? new Date().toISOString(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  const options: { value: OffDayChoice; label: string; hint: string }[] = [
    { value: "off", label: "Nghỉ", hint: "Theo Lịch, không tính công" },
    { value: "full", label: "Tăng ca cả ngày", hint: "Tính 1 ngày công" },
    { value: "half", label: "Tăng ca nửa ngày", hint: "Tính ½ ngày công" },
  ];

  return (
    <Modal onClose={onClose} maxWidth={400}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg">{profile.display_name}</h2>
          <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Ngày {formatDayLabel(date)}
          </p>
          <span
            className="text-xs font-semibold w-fit rounded-full px-2.5 py-1"
            style={{ background: "var(--color-surface)", color: "var(--color-neutral-600)" }}
          >
            📅 {offLabel}
          </span>
        </div>

        <div className="field">
          <label>Hôm nay nhân viên này</label>
          <div className="flex flex-col gap-2 mt-1">
            {options.map((opt) => {
              const active = choice === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChoice(opt.value)}
                  className="flex items-center justify-between gap-3 rounded-[10px] px-3.5 py-2.5 text-left"
                  style={{
                    border: `1.5px solid ${active ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                    background: active ? "var(--color-accent-100)" : "transparent",
                  }}
                >
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                    {opt.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {choice !== "off" && (
          <>
            <div className="field">
              <label htmlFor="ot-time">Giờ vào làm{choice === "half" ? " (không bắt buộc)" : ""}</label>
              <input
                id="ot-time"
                type="time"
                className="input"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                required={choice === "full"}
              />
            </div>
            <div className="field">
              <label htmlFor="ot-note">Ghi chú</label>
              <input
                id="ot-note"
                className="input"
                value={note}
                placeholder="VD: làm gấp dự án Irene Wu"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </>
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
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AttendanceEditCellModal({
  profile,
  date,
  entry,
  offLabel,
  onClose,
  onSaved,
  onDeleted,
}: {
  profile: Profile;
  date: string;
  entry: AttendanceEntry | undefined;
  // Set when the day is off by default — switches to the tăng ca editor.
  offLabel?: string | null;
  onClose: () => void;
  onSaved: (entry: AttendanceEntry) => void;
  onDeleted?: (workDate: string) => void;
}) {
  if (offLabel) {
    return (
      <OffDayEditor profile={profile} date={date} entry={entry} offLabel={offLabel} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} />
    );
  }
  return <WorkDayEditor profile={profile} date={date} entry={entry} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} />;
}

function WorkDayEditor({
  profile,
  date,
  entry,
  onClose,
  onSaved,
  onDeleted,
}: {
  profile: Profile;
  date: string;
  entry: AttendanceEntry | undefined;
  onClose: () => void;
  onSaved: (entry: AttendanceEntry) => void;
  onDeleted?: (workDate: string) => void;
}) {
  const [status, setStatus] = useState<"present" | "absent" | "leave" | "off" | "paid_leave" | "half_day">(entry?.status ?? "present");
  const [checkInTime, setCheckInTime] = useState(entry?.check_in_at ? formatCheckInTime(entry.check_in_at) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Xoá bản ghi chấm công ngày này?")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAttendance(profile.id, date);
      onDeleted?.(date);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setDeleting(false);
    }
  }

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
              { value: "off", label: "Ngày nghỉ" },
              { value: "paid_leave", label: "Nghỉ có lương" },
              { value: "half_day", label: "Nửa ngày công" },
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

        <div className="flex items-center justify-between gap-3">
          {entry ? (
            <button type="button" onClick={handleDelete} className="btn btn-danger btn-sm" disabled={saving || deleting}>
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
