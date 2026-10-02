import type { LeaveRequest, LeaveRequestStatus } from "@/lib/types";

// No runtime imports, so tests/calculations.test.mjs can load this in plain
// Node. Same calendar as lib/constants/attendance.ts: Monday = 0, and
// every day but Sunday is a work day (isDefaultWorkDay).
const nextDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const weekdayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const isDefaultWorkDay = (date: string) => weekdayIndex(date) !== 6;

// Đơn xin nghỉ — shared by the staff calendar, the Quản trị list and the
// server actions (supabase/migrations/leave_requests.sql).

export const LEAVE_MAX_DAYS = 31;

export const LEAVE_SELECT = "id, profile_id, start_date, end_date, half_day, reason, status, paid, decision_note, decided_at, requested_at";

export const LEAVE_STATUS: Record<LeaveRequestStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Chờ duyệt", color: "var(--status-yellow)", bg: "rgba(214,160,40,.15)" },
  approved: { label: "Đã duyệt", color: "var(--status-green)", bg: "rgba(72,160,110,.14)" },
  rejected: { label: "Không duyệt", color: "var(--status-red)", bg: "rgba(192,82,79,.12)" },
  cancelled: { label: "Đã huỷ", color: "var(--color-neutral-500)", bg: "var(--color-neutral-100)" },
};

// Every calendar day from start to end, inclusive.
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length <= LEAVE_MAX_DAYS; d = nextDay(d)) out.push(d);
  return out;
}

// The days a request actually takes off: not Sundays, not the company's
// own days off (the shared calendar's "off" events).
export function leaveWorkDays(start: string, end: string, offDates: Set<string> | string[] = []): string[] {
  const off = offDates instanceof Set ? offDates : new Set(offDates);
  return datesBetween(start, end).filter((d) => isDefaultWorkDay(d) && !off.has(d));
}

const WEEKDAY = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];
export const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

// "Thứ Bảy 03/10 · nửa ngày" or "03/10 – 07/10".
export function leaveRangeLabel(r: Pick<LeaveRequest, "start_date" | "end_date" | "half_day">): string {
  if (r.start_date === r.end_date) return `${WEEKDAY[weekdayIndex(r.start_date)]} ${dayMonth(r.start_date)}${r.half_day ? " · nửa ngày" : ""}`;
  return `${dayMonth(r.start_date)} – ${dayMonth(r.end_date)}`;
}

// How an approved request reads: "Nghỉ có lương" / "Nghỉ phép (không lương)" / "Nửa công".
export function leaveOutcome(r: Pick<LeaveRequest, "half_day" | "paid">): string {
  if (r.half_day) return "Nửa công";
  return r.paid ? "Nghỉ có lương" : "Nghỉ phép (không lương)";
}
