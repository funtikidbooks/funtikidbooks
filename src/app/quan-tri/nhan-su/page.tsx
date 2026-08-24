import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAllProfiles } from "@/lib/actions/admin";
import { StaffRoles } from "./StaffRoles";

export const metadata: Metadata = { title: "Quản trị — Nhân sự" };

export default async function AdminStaffPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role")
    .eq("id", user!.id)
    .maybeSingle();

  if (profile?.access_role !== "director") {
    redirect("/quan-tri");
  }

  const profiles = await listAllProfiles();
  return <StaffRoles initialProfiles={profiles} currentUserId={user!.id} />;
}
