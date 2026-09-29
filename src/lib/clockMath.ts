// Máy chấm công vân tay — what a finger on the machine does to that day's
// attendance row, and the three lines the machine shows back. Pure (no
// imports), shared by /api/clock/scan and tests/calculations.test.mjs.

export type ClockDayRow = {
  id: string;
  status: string;
  check_in_at: string | null;
  check_out_at?: string | null;
  check_in_source?: string | null;
} | null;

export type ClockPatch = {
  status?: string;
  check_in_at?: string;
  check_out_at?: string | null;
  check_in_source?: string;
};

export type ClockPlan =
  | { action: "check_in"; insert: boolean; patch: ClockPatch }
  | { action: "check_out"; patch: ClockPatch }
  // A second touch within REPEAT_MINUTES of the last one — nothing changes.
  | { action: "repeat"; at: string };

// Rules the route passes in from lib/constants/attendance.ts.
export type ClockRules = { workStartMinutes: number; graceMinutes: number };

export const REPEAT_MINUTES = 2;
// With only a web check-in so far, a first finger before noon is the real
// arrival (it replaces the web time); one after noon is someone leaving
// who forgot to scan in the morning, so it becomes their giờ về.
export const MIDDAY_MINUTES = 12 * 60;
// How far back a scan the machine stored while offline is still believed.
export const BACKLOG_DAYS = 3;

const VN_OFFSET_MS = 7 * 3600e3;

export function vnDate(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}
export function vnMinutes(d: Date): number {
  const v = new Date(d.getTime() + VN_OFFSET_MS);
  return v.getUTCHours() * 60 + v.getUTCMinutes();
}
export function vnHHMM(d: Date): string {
  const m = vnMinutes(d);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// The machine's own clock (synced from the internet) is used for a scan it
// couldn't send straight away — within the last BACKLOG_DAYS and not in the
// future; anything else, or no time at all, gets the server's.
export function scanTime(deviceEpochSeconds: unknown, now: Date): Date {
  const s = Number(deviceEpochSeconds);
  if (!Number.isFinite(s) || s <= 0) return now;
  const t = s * 1000;
  if (t > now.getTime() + 2 * 60e3 || t < now.getTime() - BACKLOG_DAYS * 86400e3) return now;
  return new Date(t);
}

// Minutes past the start of the day, once past the grace period (09:06 → 6,
// 09:05 → 0) — the same line isLateCheckIn() draws for "Trễ".
export function lateMinutes(at: Date, rules: ClockRules): number {
  const m = vnMinutes(at);
  return m > rules.workStartMinutes + rules.graceMinutes ? m - rules.workStartMinutes : 0;
}

const minutesBetween = (a: string | Date, b: string | Date) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60e3;

export function planScan(row: ClockDayRow, at: Date): ClockPlan {
  const iso = at.toISOString();
  if (!row) return { action: "check_in", insert: true, patch: { status: "present", check_in_at: iso, check_in_source: "device" } };

  const fromDevice = row.check_in_source === "device" && !!row.check_in_at;
  if (!fromDevice) {
    // Only a web check-in (or none) so far today.
    if (row.check_in_at && vnMinutes(at) >= MIDDAY_MINUTES) {
      if (row.check_out_at && minutesBetween(row.check_out_at, at) < REPEAT_MINUTES) return { action: "repeat", at: row.check_out_at };
      return { action: "check_out", patch: { check_out_at: iso } };
    }
    const status = row.status === "absent" ? "present" : row.status;
    return { action: "check_in", insert: false, patch: { status, check_in_at: iso, check_in_source: "device" } };
  }

  const inAt = row.check_in_at as string;
  if (minutesBetween(inAt, at) < REPEAT_MINUTES) return { action: "repeat", at: inAt };
  // An earlier touch arriving late (sent after the Wi-Fi came back): it's the
  // arrival, and the time that was there becomes the leaving time if none.
  if (at.getTime() < new Date(inAt).getTime()) {
    const out = row.check_out_at && new Date(row.check_out_at).getTime() > new Date(inAt).getTime() ? row.check_out_at : inAt;
    return { action: "check_in", insert: false, patch: { check_in_at: iso, check_out_at: out } };
  }
  if (row.check_out_at && minutesBetween(row.check_out_at, at) < REPEAT_MINUTES) return { action: "repeat", at: row.check_out_at };
  if (row.check_out_at && new Date(row.check_out_at).getTime() > at.getTime()) return { action: "repeat", at: row.check_out_at };
  return { action: "check_out", patch: { check_out_at: iso } };
}

// The machine's little screen has no Vietnamese accents: "Nhật Vy" → "Nhat Vy".
export function asciiFold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7e]/g, "")
    .trim();
}

export type ClockScreen = { title: string; big: string; note: string; tone: "ok" | "warn" | "error" };

export function screenFor(plan: ClockPlan, name: string, at: Date, rules: ClockRules, dayOff: boolean): ClockScreen {
  const who = asciiFold(name).slice(0, 21) || "Ban";
  if (plan.action === "repeat") return { title: who, big: vnHHMM(new Date(plan.at)), note: "Da cham roi", tone: "warn" };
  if (plan.action === "check_out") return { title: `Tam biet ${who}`.slice(0, 21), big: `Ve ${vnHHMM(at)}`, note: "Hen gap lai!", tone: "ok" };
  const late = dayOff ? 0 : lateMinutes(at, rules);
  return {
    title: `Chao ${who}`.slice(0, 21),
    big: `Vao ${vnHHMM(at)}`,
    note: dayOff ? "Hom nay la ngay nghi" : late ? `Tre ${late} phut` : "Dung gio",
    tone: late ? "warn" : "ok",
  };
}
