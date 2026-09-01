import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listStaffDocuments } from "@/lib/actions/documents";
import { DocumentsPanel } from "@/components/workspace/DocumentsPanel";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Hợp đồng" };

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profiles }, { data: me }, documents] = await Promise.all([
    supabase.from("profiles").select("*").order("display_name", { ascending: true }),
    user
      ? supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    listStaffDocuments(),
  ]);

  const canManage = me?.access_role === "director" || me?.role === "Project Manager";

  return (
    <DocumentsPanel
      profiles={(profiles ?? []) as Profile[]}
      currentUserId={user?.id ?? ""}
      canManage={canManage}
      initialDocuments={documents}
    />
  );
}
