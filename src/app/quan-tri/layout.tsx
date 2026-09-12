import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { listPendingPayrollFeedbackIds } from "@/lib/actions/payroll";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Goes through the shared, per-request-cached requireUser() (see its own
  // comment in lib/supabase/server.ts) instead of calling auth.getUser()
  // directly — every page under /quan-tri used to redo this same auth
  // round trip on top of this layout's, and listPendingPayrollFeedbackIds()
  // below reuses it too.
  let supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
  let user: Awaited<ReturnType<typeof requireUser>>["user"];
  try {
    ({ supabase, user } = await requireUser());
  } catch {
    redirect("/dang-nhap?next=/quan-tri");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url, role, access_role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  // Only director/admin manage site content — staff belong in the Kanban
  // workspace instead, except a "Project Manager" job title, which gets
  // let in just far enough to reach chấm công/bảng lương/hoá đơn (see
  // can_manage_hr() in supabase/schema.sql).
  const isProjectManager = profile?.role === "Project Manager";
  if (!profile || (profile.access_role === "staff" && !isProjectManager)) {
    redirect("/workspace");
  }

  const isDirector = profile.access_role === "director";
  const initialPendingPayrollFeedbackIds = isDirector || isProjectManager ? await listPendingPayrollFeedbackIds() : [];

  return (
    <div className="flex flex-col md:flex-row min-h-screen" style={{ background: "var(--color-bg)" }}>
      <AdminSidebar
        user={{
          displayName: profile.display_name,
          email: user.email ?? "",
          accessRole: profile.access_role,
          jobTitle: profile.role,
        }}
        initialPendingPayrollFeedbackIds={initialPendingPayrollFeedbackIds}
      />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
