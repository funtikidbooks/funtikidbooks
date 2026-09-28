// Thử việc (probation) rules — shared by the Thành viên directory, Quản trị →
// Nhân sự and tests/calculations.test.mjs. Pure date math on "YYYY-MM-DD"
// strings in Vietnam time, nothing browser- or server-specific.
//
// A new staff member is on probation for PROBATION_MONTHS from their join
// date. Once that's over and nobody has confirmed them yet, they stay
// "due" (hết hạn thử việc — chờ xác nhận) for DUE_WINDOW_DAYS so the
// director/PM gets the reminder; past that, and for everyone who joined
// before this feature existed, they simply count as official.

export const PROBATION_MONTHS = 2;
export const DUE_WINDOW_DAYS = 30;

export type ProbationStatus =
  | { kind: "official"; officialAt: string | null }
  | { kind: "probation"; endsOn: string; daysLeft: number }
  | { kind: "due"; endsOn: string; daysOver: number };

const DAY_MS = 86_400_000;

// A bare date is taken as-is; a timestamp (profiles.created_at) is turned
// into the Vietnam calendar date it falls on.
export function vnDateOf(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

// 31/12 + 2 months → 28/02 (or 29/02), not 03/03.
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function probationStatus(
  person: { joined_at: string | null; created_at: string; access_role: string },
  officialAt: string | null | undefined,
  today: string,
): ProbationStatus {
  if (officialAt) return { kind: "official", officialAt };
  if (person.access_role === "director") return { kind: "official", officialAt: null };
  const joined = vnDateOf(person.joined_at ?? person.created_at);
  const endsOn = addMonths(joined, PROBATION_MONTHS);
  const left = daysBetween(today, endsOn);
  if (left > 0) return { kind: "probation", endsOn, daysLeft: left };
  const over = daysBetween(endsOn, today);
  if (over <= DUE_WINDOW_DAYS) return { kind: "due", endsOn, daysOver: over };
  return { kind: "official", officialAt: null };
}

export function formatVnDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}
