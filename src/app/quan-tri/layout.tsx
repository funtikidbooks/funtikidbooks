import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

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
  // workspace instead.
  if (!profile || profile.access_role === "staff") {
    redirect("/workspace");
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg)" }}>
      <AdminSidebar
        user={{ displayName: profile.display_name, email: user.email ?? "", accessRole: profile.access_role }}
      />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
