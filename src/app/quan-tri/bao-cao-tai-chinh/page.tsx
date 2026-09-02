import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getMonthlySalaryTotal,
  listFinanceEntries,
  listHomeLoanInstallments,
  listPersonalDebts,
} from "@/lib/actions/finance";
import { addMonths, firstOfMonth, vnToday } from "@/lib/constants/attendance";
import { FinancialReportView } from "@/components/admin/FinancialReportView";

export const metadata: Metadata = { title: "Quản trị — Báo cáo tài chính" };

export default async function AdminFinancialReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("access_role").eq("id", user!.id).maybeSingle();

  if (profile?.access_role !== "director") {
    redirect("/quan-tri");
  }

  const monthStart = firstOfMonth(vnToday());
  const prevMonthStart = addMonths(monthStart, -1);

  const [entries, salaryTotal, prevEntries, prevSalaryTotal, debts, homeLoanInstallments] = await Promise.all([
    listFinanceEntries(monthStart),
    getMonthlySalaryTotal(monthStart),
    listFinanceEntries(prevMonthStart),
    getMonthlySalaryTotal(prevMonthStart),
    listPersonalDebts(),
    listHomeLoanInstallments(),
  ]);

  return (
    <FinancialReportView
      initialMonth={monthStart}
      initialEntries={entries}
      initialSalaryTotal={salaryTotal}
      initialPrevEntries={prevEntries}
      initialPrevSalaryTotal={prevSalaryTotal}
      debts={debts}
      homeLoanInstallments={homeLoanInstallments}
    />
  );
}
