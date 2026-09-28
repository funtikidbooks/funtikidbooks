import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/actions/dashboard";
import { CUMULATIVE_START_MONTH } from "@/lib/financeSummary";
import { DashboardView } from "./DashboardView";

export const metadata: Metadata = { title: "Quản trị — Tổng quan" };

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle();
  if (me?.access_role !== "director") redirect("/quan-tri/nhan-su");

  const data = await getDashboardData();
  return <DashboardView data={data} cumulativeStartMonth={CUMULATIVE_START_MONTH} />;
}
