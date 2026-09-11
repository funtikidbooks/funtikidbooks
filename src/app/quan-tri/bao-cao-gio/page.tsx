import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listHourReports, listUnreviewedHourReportIds } from "@/lib/actions/hourReports";
import { listChannels } from "@/lib/actions/meetings";
import { HourReportsAdmin } from "@/components/admin/HourReportsAdmin";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Quản trị — Báo cáo giờ" };

export default async function AdminHourReportsPage() {
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

  const [reports, unreviewedIds, channels, { data: profiles }] = await Promise.all([
    listHourReports(),
    listUnreviewedHourReportIds(),
    listChannels(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, created_at")
      .order("display_name", { ascending: true }),
  ]);

  return (
    <HourReportsAdmin
      initialReports={reports}
      initialUnreviewedCount={unreviewedIds.length}
      channels={channels}
      staff={(profiles ?? []) as Profile[]}
    />
  );
}
