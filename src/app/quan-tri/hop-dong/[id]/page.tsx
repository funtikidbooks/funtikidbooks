import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffDocument } from "@/lib/actions/documents";
import { DocumentDraftEditor } from "@/components/admin/DocumentDraftEditor";
import { DocumentDetailView } from "@/components/workspace/DocumentDetailView";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Quản trị — Hợp đồng" };

export default async function AdminDocumentDetailPage({
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

  const document = await getStaffDocument(id);
  if (!document) notFound();

  if (document.status === "draft") {
    const { data: profiles } = await supabase.from("profiles").select("*").order("display_name", { ascending: true });
    return <DocumentDraftEditor document={document} profiles={(profiles ?? []) as Profile[]} />;
  }

  const { data: staffProfile } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, theme, created_at")
    .eq("id", document.profile_id)
    .maybeSingle();
  if (!staffProfile) notFound();

  return (
    <DocumentDetailView
      document={document}
      profile={staffProfile as Profile}
      currentUserId={user!.id}
      canManage
      backHref="/quan-tri/hop-dong"
      backLabel="Quay lại Hợp đồng"
    />
  );
}
