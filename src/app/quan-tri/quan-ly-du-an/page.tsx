import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getPmData } from "@/lib/actions/pm";
import { PmView } from "./PmView";

export const metadata: Metadata = { title: "Quản trị — Quản lý dự án" };

export default async function ProjectManagerPage() {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (me?.access_role !== "director" && me?.role !== "Project Manager") redirect("/quan-tri");

  const data = await getPmData();
  return <PmView data={data} />;
}
