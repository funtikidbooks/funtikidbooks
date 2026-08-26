import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listPayrollForMonth } from "@/lib/actions/payroll";
import { PayrollBoard } from "@/components/admin/PayrollBoard";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Quản trị — Bảng lương" };

export default async function AdminPayrollPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role, role")
    .eq("id", user!.id)
    .maybeSingle();

  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    redirect("/quan-tri");
  }

  const [records, { data: profiles }] = await Promise.all([
    listPayrollForMonth(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, created_at")
      .neq("access_role", "director")
      .order("display_name", { ascending: true }),
  ]);

  return <PayrollBoard initialRecords={records} staff={(profiles ?? []) as Profile[]} />;
}
