"use server";

import { createClient } from "@/lib/supabase/server";
import { firstOfMonth, vnToday } from "@/lib/constants/attendance";
import type { FinanceEntry, FinanceEntryType, HomeLoanInstallment, PayrollRecord, PersonalDebt } from "@/lib/types";

// This ledger is deliberately more sensitive than payroll/attendance — it's
// the whole business's P&L, not one employee's — so it's director-only,
// full stop. Project Managers get can_manage_hr() elsewhere; not here.
async function requireDirector() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");

  const { data: profile } = await supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle();
  if (profile?.access_role !== "director") throw new Error("Bạn không có quyền này.");
  return { supabase, user };
}

export async function listFinanceEntries(monthStartInput?: string): Promise<FinanceEntry[]> {
  const { supabase } = await requireDirector();
  const monthStart = firstOfMonth(monthStartInput ?? vnToday());
  const { data } = await supabase
    .from("finance_entries")
    .select("*")
    .eq("entry_month", monthStart)
    .order("created_at", { ascending: true });
  return (data ?? []) as FinanceEntry[];
}

// Every entry for a whole calendar year at once — backs the yearly summary
// table without firing 12 separate month queries.
export async function listFinanceEntriesForYear(year: number): Promise<FinanceEntry[]> {
  const { supabase } = await requireDirector();
  const { data } = await supabase
    .from("finance_entries")
    .select("*")
    .gte("entry_month", `${year}-01-01`)
    .lte("entry_month", `${year}-12-01`)
    .order("entry_month", { ascending: true });
  return (data ?? []) as FinanceEntry[];
}

export async function upsertFinanceEntry(input: {
  id?: string;
  entryMonth: string;
  type: FinanceEntryType;
  category: string;
  amount: number;
  note?: string;
}): Promise<FinanceEntry> {
  const { supabase, user } = await requireDirector();
  const entryMonth = firstOfMonth(input.entryMonth);
  const category = input.category.trim();
  if (!category) throw new Error("Cần nhập tên khoản mục.");

  const row = {
    entry_month: entryMonth,
    type: input.type,
    category,
    amount: Math.max(0, input.amount),
    note: input.note?.trim() || null,
    created_by: user.id,
  };

  const query = input.id
    ? supabase.from("finance_entries").update(row).eq("id", input.id)
    : supabase.from("finance_entries").insert(row);

  const { data, error } = await query.select("*").single();
  if (error || !data) throw new Error("Không thể lưu khoản này.");
  return data as FinanceEntry;
}

export async function deleteFinanceEntry(id: string) {
  const { supabase } = await requireDirector();
  await supabase.from("finance_entries").delete().eq("id", id);
}

// Salary is never entered on this ledger — it's read straight off the real
// payroll sheet for the same month, so the two can never drift apart.
// Mirrors payroll.ts's listPayrollForMonth but under this page's own
// director-only gate instead of can_manage_hr(). Also folds in
// historical_salary_totals — the lump-sum figure for months before
// per-employee payroll_records existed (see that table's own comment).
export async function getMonthlySalaryTotal(monthStartInput?: string): Promise<number> {
  const { supabase } = await requireDirector();
  const monthStart = firstOfMonth(monthStartInput ?? vnToday());
  const [{ data }, { data: historical }] = await Promise.all([
    supabase.from("payroll_records").select("*").eq("month", monthStart),
    supabase.from("historical_salary_totals").select("total_amount").eq("month", monthStart).maybeSingle(),
  ]);
  const records = (data ?? []) as PayrollRecord[];
  const payrollTotal = records.reduce((sum, r) => sum + r.base_salary + r.items.reduce((s, item) => s + item.amount, 0), 0);
  return payrollTotal + Number(historical?.total_amount ?? 0);
}

// One salary total per month for the whole year — backs the yearly table
// the same way listFinanceEntriesForYear does for the ledger entries.
export async function getYearlySalaryTotals(year: number): Promise<Record<string, number>> {
  const { supabase } = await requireDirector();
  const [{ data }, { data: historical }] = await Promise.all([
    supabase.from("payroll_records").select("*").gte("month", `${year}-01-01`).lte("month", `${year}-12-01`),
    supabase.from("historical_salary_totals").select("month, total_amount").gte("month", `${year}-01-01`).lte("month", `${year}-12-01`),
  ]);
  const records = (data ?? []) as PayrollRecord[];
  const totals: Record<string, number> = {};
  for (const r of records) {
    const perRecord = r.base_salary + r.items.reduce((s, item) => s + item.amount, 0);
    totals[r.month] = (totals[r.month] ?? 0) + perRecord;
  }
  for (const h of (historical ?? []) as { month: string; total_amount: number }[]) {
    totals[h.month] = (totals[h.month] ?? 0) + Number(h.total_amount);
  }
  return totals;
}

// The director's own personal debt tracking ("Nợ mẹ", "Nợ ngân hàng", ...)
// — unrelated to the business P&L above, just kept on the same
// director-only page.
export async function listPersonalDebts(): Promise<PersonalDebt[]> {
  const { supabase } = await requireDirector();
  const { data } = await supabase.from("personal_debts").select("*").order("sort_order", { ascending: true });
  return (data ?? []) as PersonalDebt[];
}

export async function upsertPersonalDebt(input: {
  id?: string;
  label: string;
  totalAmount: number | null;
  remainingAmount: number | null;
  sortOrder?: number;
  // Recorded on the director's own explicit request: a repayment made here
  // also lands on the business P&L as a variable cost for the month it was
  // paid in — sếp Phúc confirmed he wants this even knowing it's a personal
  // debt, not a business one, so the reported net profit is his to read
  // with that in mind.
  repayment?: { amount: number; month: string };
}): Promise<{ debt: PersonalDebt; addedEntry: FinanceEntry | null }> {
  const { supabase, user } = await requireDirector();
  const label = input.label.trim();
  if (!label) throw new Error("Cần nhập tên khoản nợ.");

  const row = {
    label,
    total_amount: input.totalAmount,
    remaining_amount: input.remainingAmount,
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    created_by: user.id,
  };

  const query = input.id
    ? supabase.from("personal_debts").update(row).eq("id", input.id)
    : supabase.from("personal_debts").insert(row);

  const { data, error } = await query.select("*").single();
  if (error || !data) throw new Error("Không thể lưu khoản nợ này.");
  const debt = data as PersonalDebt;

  let addedEntry: FinanceEntry | null = null;
  if (input.repayment && input.repayment.amount > 0) {
    const { data: entry } = await supabase
      .from("finance_entries")
      .insert({
        entry_month: firstOfMonth(input.repayment.month),
        type: "variable_cost",
        category: `Trả nợ — ${label}`,
        amount: input.repayment.amount,
        note: "Tự động thêm khi ghi nhận trả nợ cá nhân",
        created_by: user.id,
      })
      .select("*")
      .single();
    addedEntry = (entry as FinanceEntry) ?? null;
  }

  return { debt, addedEntry };
}

export async function deletePersonalDebt(id: string) {
  const { supabase } = await requireDirector();
  await supabase.from("personal_debts").delete().eq("id", id);
}

// The director's home-loan repayment schedule — imported once (see
// scratchpad seeding script, not this file — the 239 rows come straight
// from his own amortization spreadsheet), then just ticked off kỳ by kỳ.
export async function listHomeLoanInstallments(): Promise<HomeLoanInstallment[]> {
  const { supabase } = await requireDirector();
  const { data } = await supabase.from("home_loan_installments").select("*").order("period_number", { ascending: true });
  return (data ?? []) as HomeLoanInstallment[];
}

// Same P&L-visibility choice as upsertPersonalDebt's repayment param, for
// the home loan's own kỳ-by-kỳ schedule: ticking a kỳ paid adds its full
// payment (gốc + lãi) as a variable cost in the kỳ's own due_date month;
// unticking it (a correction, not a new payment) removes that same entry
// rather than leaving a stale one behind. Matched by category + month
// instead of a stored link, since there's no schema change for this yet —
// a director renaming the auto-added entry's category by hand would break
// that match on a later untick, same tradeoff as the attachment-orphan
// cases elsewhere in this file.
export async function setHomeLoanInstallmentPaid(
  id: string,
  paid: boolean,
): Promise<{ installment: HomeLoanInstallment; addedEntry: FinanceEntry | null; removedEntryId: string | null }> {
  const { supabase, user } = await requireDirector();
  const { data, error } = await supabase
    .from("home_loan_installments")
    .update({ is_paid: paid })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể cập nhật kỳ trả nợ.");
  const installment = data as HomeLoanInstallment;

  const category = `Trả nợ nhà — Kỳ ${installment.period_number}`;
  const entryMonth = firstOfMonth(installment.due_date);

  if (paid) {
    const { data: entry } = await supabase
      .from("finance_entries")
      .insert({
        entry_month: entryMonth,
        type: "variable_cost",
        category,
        amount: installment.total_payment,
        note: "Tự động thêm khi đánh dấu đã trả kỳ nợ nhà",
        created_by: user.id,
      })
      .select("*")
      .single();
    return { installment, addedEntry: (entry as FinanceEntry) ?? null, removedEntryId: null };
  }

  const { data: removed } = await supabase
    .from("finance_entries")
    .delete()
    .eq("type", "variable_cost")
    .eq("category", category)
    .eq("entry_month", entryMonth)
    .select("id");
  return { installment, addedEntry: null, removedEntryId: (removed?.[0] as { id: string } | undefined)?.id ?? null };
}
