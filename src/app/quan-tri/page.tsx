import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

// Director/admin land on the content-editing home; a Project Manager can't
// touch that (listProjects() there requires requireContentEditor(), which
// throws for a plain "staff" access_role and crashed instead of redirecting)
// — send them to the one HR page every PM can actually load instead.
export default async function AdminHomePage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();

  if (profile?.access_role === "staff" && profile.role === "Project Manager") {
    redirect("/quan-tri/nhan-su");
  }
  redirect("/quan-tri/du-an");
}
