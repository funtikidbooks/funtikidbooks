import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getMonthlySalaryTotal,
  getYearlySalaryTotals,
  listFinanceEntries,
  listFinanceEntriesForYear,
  listPersonalDebts,
} from "@/lib/actions/finance";
import { firstOfMonth, vnToday } from "@/lib/constants/attendance";
import { FinanceBoard } from "@/components/admin/FinanceBoard";

export const metadata: Metadata = { title: "Quản trị — Tài chính" };

export default async function AdminFinancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("access_role").eq("id", user!.id).maybeSingle();

  if (profile?.access_role !== "director") {
    redirect("/quan-tri");
  }

  const monthStart = firstOfMonth(vnToday());
  const year = new Date(`${monthStart}T00:00:00`).getFullYear();

  const [entries, salaryTotal, yearEntries, yearSalaryTotals, debts] = await Promise.all([
    listFinanceEntries(monthStart),
    getMonthlySalaryTotal(monthStart),
    listFinanceEntriesForYear(year),
    getYearlySalaryTotals(year),
    listPersonalDebts(),
  ]);

  return (
    <FinanceBoard
      initialMonth={monthStart}
      initialEntries={entries}
      initialSalaryTotal={salaryTotal}
      initialYear={year}
      initialYearEntries={yearEntries}
      initialYearSalaryTotals={yearSalaryTotals}
      initialDebts={debts}
    />
  );
}
