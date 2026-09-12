import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { listAllClientProjects } from "@/lib/actions/clientPortal";
import { ClientProjectsInbox } from "@/components/workspace/ClientProjectsInbox";

export const metadata: Metadata = { title: "Khách hàng" };

export default async function WorkspaceClientProjectsPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  const allowed = profile?.access_role === "director" || profile?.access_role === "admin" || profile?.role === "Project Manager";
  if (!allowed) redirect("/workspace");

  const projects = await listAllClientProjects();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-xl">Khách hàng — Dự án gửi qua Công việc</h1>
        <span className="tag tag-neutral">{projects.length} dự án</span>
      </div>
      <ClientProjectsInbox initialProjects={projects} />
    </div>
  );
}
