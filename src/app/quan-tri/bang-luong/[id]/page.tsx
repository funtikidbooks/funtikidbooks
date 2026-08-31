import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPayrollById } from "@/lib/actions/payroll";
import { PayrollPrintView } from "@/components/admin/PayrollPrintView";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Phiếu lương" };

export default async function AdminPayrollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const record = await getPayrollById(id);
  if (!record) notFound();

  const { data: staffProfile } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, theme, created_at")
    .eq("id", record.profile_id)
    .maybeSingle();
  if (!staffProfile) notFound();

  return <PayrollPrintView record={record} profile={staffProfile as Profile} />;
}
