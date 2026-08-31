import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { listPendingPayrollFeedbackIds } from "@/lib/actions/payroll";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
    <div className="flex min-h-screen" style={{ background: "var(--color-bg)" }}>
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
