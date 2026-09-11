import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listWeekHourReports } from "@/lib/actions/hourReports";
import { listChannels } from "@/lib/actions/meetings";
import { HourTimesheet } from "@/components/workspace/HourTimesheet";
import { mondayOf, vnToday } from "@/lib/constants/attendance";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Báo cáo giờ" };

export default async function HourTimesheetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role, role")
    .eq("id", user!.id)
    .maybeSingle();
  const isHrManager = profile?.access_role === "director" || profile?.role === "Project Manager";

  const [reports, channels, { data: profiles }] = await Promise.all([
    listWeekHourReports(mondayOf(vnToday())),
    listChannels(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, created_at")
      .order("display_name", { ascending: true }),
  ]);

  return (
    <HourTimesheet
      initialReports={reports}
      channels={channels}
      staff={(profiles ?? []) as Profile[]}
      currentUserId={user!.id}
      isHrManager={isHrManager}
    />
  );
}
