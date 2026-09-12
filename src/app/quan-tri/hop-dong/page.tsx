import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { listAllStaffDocuments } from "@/lib/actions/documents";
import { DocumentsAdminPanel } from "@/components/admin/DocumentsAdminPanel";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Quản trị — Hợp đồng" };

export default async function AdminDocumentsPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    redirect("/quan-tri");
  }

  const [{ data: profiles }, documents] = await Promise.all([
    supabase.from("profiles").select("*").order("display_name", { ascending: true }),
    listAllStaffDocuments(),
  ]);

  return <DocumentsAdminPanel profiles={(profiles ?? []) as Profile[]} initialDocuments={documents} />;
}
