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
// director-only gate instead of can_manage_hr().
export async function getMonthlySalaryTotal(monthStartInput?: string): Promise<number> {
  const { supabase } = await requireDirector();
  const monthStart = firstOfMonth(monthStartInput ?? vnToday());
  const { data } = await supabase.from("payroll_records").select("*").eq("month", monthStart);
  const records = (data ?? []) as PayrollRecord[];
  return records.reduce((sum, r) => sum + r.base_salary + r.items.reduce((s, item) => s + item.amount, 0), 0);
}

// One salary total per month for the whole year — backs the yearly table
// the same way listFinanceEntriesForYear does for the ledger entries.
export async function getYearlySalaryTotals(year: number): Promise<Record<string, number>> {
  const { supabase } = await requireDirector();
  const { data } = await supabase
    .from("payroll_records")
    .select("*")
    .gte("month", `${year}-01-01`)
    .lte("month", `${year}-12-01`);
  const records = (data ?? []) as PayrollRecord[];
  const totals: Record<string, number> = {};
  for (const r of records) {
    const perRecord = r.base_salary + r.items.reduce((s, item) => s + item.amount, 0);
    totals[r.month] = (totals[r.month] ?? 0) + perRecord;
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
}): Promise<PersonalDebt> {
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
  return data as PersonalDebt;
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

export async function setHomeLoanInstallmentPaid(id: string, paid: boolean): Promise<HomeLoanInstallment> {
  const { supabase } = await requireDirector();
  const { data, error } = await supabase
    .from("home_loan_installments")
    .update({ is_paid: paid })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể cập nhật kỳ trả nợ.");
  return data as HomeLoanInstallment;
}
