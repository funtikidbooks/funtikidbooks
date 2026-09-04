import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listDocumentLibraryItems } from "@/lib/actions/documentsLibrary";
import { DocumentsLibraryPanel } from "./DocumentsLibraryPanel";

export const metadata: Metadata = { title: "Quản trị — Tài liệu" };

export default async function AdminDocumentLibraryPage() {
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

  const items = await listDocumentLibraryItems();
  return <DocumentsLibraryPanel initialItems={items} />;
}
