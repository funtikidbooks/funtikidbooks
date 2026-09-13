import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { listAllClientProjects } from "@/lib/actions/clientPortal";
import { listVisitorConversations } from "@/lib/actions/support-chat";
import { ClientProjectsInbox } from "@/components/workspace/ClientProjectsInbox";

export const metadata: Metadata = { title: "Khách hàng" };

export default async function WorkspaceClientProjectsPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  const allowed = profile?.access_role === "director" || profile?.access_role === "admin" || profile?.role === "Project Manager";
  if (!allowed) redirect("/workspace");

  // One inbox for both kinds of customer contact — a signed-in client's
  // project (Công việc) and an anonymous site visitor's chat widget message
  // — so director/PM check one place instead of two. See
  // ClientProjectsInbox.tsx for how the two get normalized side by side.
  const [projects, visitorConversations] = await Promise.all([listAllClientProjects(), listVisitorConversations()]);
  const total = projects.length + visitorConversations.length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-xl">Khách hàng</h1>
        <span className="tag tag-neutral">{total} cuộc trò chuyện</span>
      </div>
      <ClientProjectsInbox initialProjects={projects} initialVisitorConversations={visitorConversations} />
    </div>
  );
}
