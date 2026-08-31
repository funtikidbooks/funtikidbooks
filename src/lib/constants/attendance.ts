// Shared by both the server actions (lib/actions/attendance.ts) and the
// client-side attendance views — pure date math + formatting, safe to
// import from either side.

export const WEEKDAYS_FULL = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
export const WEEKDAYS_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

// Office hours: 09:00–18:30, Monday–Friday. Saturday varies and isn't
// enforced yet; Sunday is always off.
export const WORK_START_HOUR = 9;
export const WORK_START_MINUTE = 0;
export const WORK_HOURS_LABEL = "09:00 – 18:30 (Thứ 2 – Thứ 6)";

// A check-in up to this many minutes after WORK_START still counts as
// on-time — only later than that gets flagged "Trễ".
export const LATE_GRACE_MINUTES = 15;

// Logging into the workspace before this time doesn't auto-record a
// check-in at all (someone browsing at 3am or 8am isn't "at work" yet) —
// it just keeps trying on every later page load that same day until one
// lands at or after this hour. There's no upper bound: showing up late
// still checks in fine, just flagged "Trễ" via isLateCheckIn above.
export const EARLIEST_CHECK_IN_HOUR = 8;
export const EARLIEST_CHECK_IN_MINUTE = 30;

// "Ngày làm việc" always follows Vietnam local time, not the server's UTC
// clock — a login at 00:30 VN time should count for that VN calendar day.
export function vnToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

// A calendar event's own work_date, independent of whatever UTC offset it
// happened to be stored at — an all-day event created for a VN calendar day
// is saved as that day's local midnight, which lands on the *previous* UTC
// calendar date, so a naive `.slice(0, 10)` on start_at is off by a day.
export function toVnDateString(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

// Monday-start week containing `dateStr` (YYYY-MM-DD), returned as the
// Monday's date string.
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.toLocaleDateString("en-CA");
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

export function weekDaysOf(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

// dateStr's index within a Monday-start week: Mon=0 .. Sun=6.
export function weekdayIndex(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00`);
  return (d.getDay() + 6) % 7;
}

export function isMonToFri(dateStr: string): boolean {
  return weekdayIndex(dateStr) <= 4;
}

export function formatCheckInTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(iso),
  );
}

export function isLateCheckIn(iso: string): boolean {
  const hm = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
  const [h, m] = hm.split(":").map(Number);
  const minutesSinceMidnight = h * 60 + m;
  const thresholdMinutes = WORK_START_HOUR * 60 + WORK_START_MINUTE + LATE_GRACE_MINUTES;
  return minutesSinceMidnight > thresholdMinutes;
}

// True before EARLIEST_CHECK_IN_HOUR:EARLIEST_CHECK_IN_MINUTE VN time — see
// checkInIfNeeded(), which uses this to skip auto-recording a too-early login.
export function isBeforeCheckInWindow(iso: string): boolean {
  const hm = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
  const [h, m] = hm.split(":").map(Number);
  const minutesSinceMidnight = h * 60 + m;
  const windowStartMinutes = EARLIEST_CHECK_IN_HOUR * 60 + EARLIEST_CHECK_IN_MINUTE;
  return minutesSinceMidnight < windowStartMinutes;
}

export function formatDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const MONTH_LABELS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

export function firstOfMonth(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(1);
  return d.toLocaleDateString("en-CA");
}

export function addMonths(monthStart: string, n: number): string {
  const d = new Date(`${monthStart}T00:00:00`);
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString("en-CA");
}

export function lastDayOfMonth(monthStart: string): string {
  const d = new Date(`${monthStart}T00:00:00`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toLocaleDateString("en-CA");
}

// 6-week (42-day) Monday-start grid covering `monthStart`'s month, the same
// shape the company calendar (workspace/lich) uses.
export function monthGridDates(monthStart: string): string[] {
  const d = new Date(`${monthStart}T00:00:00`);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const dd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return dd.toLocaleDateString("en-CA");
  });
}

export function isSameMonth(dateStr: string, monthStart: string): boolean {
  return dateStr.slice(0, 7) === monthStart.slice(0, 7);
}

export type AttendanceSummary = { present: number; late: number; absent: number; leave: number };

// Shared by the attendance month-detail view and the payroll form (which
// suggests deductions from these same counts, and whose "Số ngày đi làm"
// autofill reads straight off `present`). "off" (a director-marked day
// off — a Saturday the whole team had off, say) is deliberately not
// tallied into any bucket here, the same as a day with no entry at all —
// it shouldn't inflate "Vắng" or count as a worked day either. "paid_leave"
// (a statutory/company holiday) is the opposite: it folds into `present`
// on purpose, since a paid holiday still counts as a full ngày công for
// payroll even though nobody actually clocked in.
export function summarizeAttendance(
  entries: { work_date: string; status: "present" | "absent" | "leave" | "off" | "paid_leave"; check_in_at: string | null }[],
): AttendanceSummary {
  let present = 0;
  let late = 0;
  let absent = 0;
  let leave = 0;
  for (const e of entries) {
    if (e.status === "off") continue;
    if (e.status === "absent") absent++;
    else if (e.status === "leave") leave++;
    else if (e.status === "paid_leave") present++;
    else if (e.status === "present" && e.check_in_at) {
      present++;
      if (isLateCheckIn(e.check_in_at)) late++;
    }
  }
  return { present, late, absent, leave };
}
