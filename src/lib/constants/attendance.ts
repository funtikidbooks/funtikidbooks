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

// "Ngày làm việc" always follows Vietnam local time, not the server's UTC
// clock — a login at 00:30 VN time should count for that VN calendar day.
export function vnToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
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
  return h > WORK_START_HOUR || (h === WORK_START_HOUR && m > WORK_START_MINUTE);
}

export function formatDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
