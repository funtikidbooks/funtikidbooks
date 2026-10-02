import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { listPushHealth } from "@/lib/actions/push";
import { PushHealthBoard } from "./PushHealthBoard";

export const metadata: Metadata = { title: "Quản trị — Thông báo trên máy" };
export const dynamic = "force-dynamic";

// Who actually receives chat notifications, device by device — director
// and Project Manager, like the rest of Nhân sự.
export default async function PushHealthPage() {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (me?.access_role !== "director" && me?.role !== "Project Manager") redirect("/quan-tri");

  const people = await listPushHealth();
  return <PushHealthBoard initialPeople={people} currentUserId={user.id} />;
}
