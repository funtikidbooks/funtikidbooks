import type { SalaryAdvance, SalaryAdvanceStatus } from "@/lib/types";

// Ứng tiền trước — shared by the staff panel, the director's list and the
// server actions. The database enforces the same minimum
// (supabase/migrations/salary_advances.sql).
export const ADVANCE_MIN = 1_000_000;
export const ADVANCE_MAX = 1_000_000_000;

export const SALARY_ADVANCE_SELECT =
  "id, profile_id, amount, reason, status, approved_amount, deduct_month, decision_note, decided_at, payroll_record_id, requested_at";

export function toSalaryAdvance(row: Record<string, unknown>): SalaryAdvance {
  return {
    ...(row as SalaryAdvance),
    amount: Number(row.amount),
    approved_amount: row.approved_amount == null ? null : Number(row.approved_amount),
  };
}

// What the payslip loses for an approved advance.
export const advancePaid = (a: SalaryAdvance) => a.approved_amount ?? a.amount;

export const payMonthLabel = (month: string) => `T${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;

function vnClock(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600e3); // read with getUTC* = Vietnam time
}
export function shortDate(iso: string) {
  const d = vnClock(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function shortTime(iso: string) {
  const d = vnClock(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export const ADVANCE_STATUS: Record<SalaryAdvanceStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Chờ duyệt", color: "var(--status-yellow)", bg: "rgba(214,160,40,.15)" },
  approved: { label: "Đã duyệt", color: "var(--status-green)", bg: "rgba(72,160,110,.14)" },
  rejected: { label: "Không duyệt", color: "var(--status-red)", bg: "rgba(192,82,79,.12)" },
  cancelled: { label: "Đã huỷ", color: "var(--color-neutral-500)", bg: "var(--color-neutral-100)" },
};

export const groupDigits = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
// Typed money: keeps the digits only ("1.500.000" → 1500000).
export const parseMoney = (text: string) => Number(text.replace(/\D/g, "").slice(0, 10)) || 0;
