import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listPayrollConfirmations, listPayrollForMonth } from "@/lib/actions/payroll";
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

  const isDirector = profile?.access_role === "director";
  if (!isDirector && profile?.role !== "Project Manager") {
    redirect("/quan-tri");
  }

  // The director sees and manages their own payroll too, same card grid as
  // everyone else — but a Project Manager (who also reaches this page via
  // can_manage_hr()) never should, so the director-exclusion stays in
  // place for anyone who isn't the director themselves.
  let profilesQuery = supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, created_at")
    .order("display_name", { ascending: true });
  if (!isDirector) {
    profilesQuery = profilesQuery.neq("access_role", "director");
  }

  const [records, { data: profiles }] = await Promise.all([listPayrollForMonth(), profilesQuery]);
  const confirmations = await listPayrollConfirmations(records.map((r) => r.id));

  return (
    <PayrollBoard
      initialRecords={records}
      initialConfirmedIds={confirmations.map((c) => c.payroll_record_id)}
      staff={(profiles ?? []) as Profile[]}
    />
  );
}
