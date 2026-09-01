import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffDocument } from "@/lib/actions/documents";
import { DocumentDetailView } from "@/components/workspace/DocumentDetailView";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Hợp đồng" };

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  // getStaffDocument() already comes back null for a document that isn't
  // this user's own and they're not HR — RLS draws that line, this just
  // reacts to it the same way as any other missing row.
  const document = await getStaffDocument(id);
  if (!document) notFound();

  const [{ data: me }, { data: staffProfile }] = await Promise.all([
    supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, theme, created_at")
      .eq("id", document.profile_id)
      .maybeSingle(),
  ]);
  if (!staffProfile) notFound();

  const canManage = me?.access_role === "director" || me?.role === "Project Manager";

  // Composing/sending a draft only happens from /quan-tri/hop-dong now —
  // land an HR manager who follows an old draft link there instead of
  // showing them the sign/print view for a document nobody's seen yet.
  if (document.status === "draft" && canManage) {
    redirect(`/quan-tri/hop-dong/${id}`);
  }

  return (
    <DocumentDetailView
      document={document}
      profile={staffProfile as Profile}
      currentUserId={user.id}
      canManage={canManage}
    />
  );
}
