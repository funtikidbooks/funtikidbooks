import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAllAttendance, listOffDates } from "@/lib/actions/attendance";
import { listStaffBankInfo } from "@/lib/actions/admin";
import { AttendanceBoard } from "@/components/admin/AttendanceBoard";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Quản trị — Chấm công" };

export default async function AdminAttendancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role, role")
    .eq("id", user!.id)
    .maybeSingle();

  const isDirector = profile?.access_role === "director";
  if (!isDirector && profile?.role !== "Project Manager") {
    redirect("/quan-tri");
  }

  const [entries, offDates, { data: profiles }] = await Promise.all([
    listAllAttendance(),
    listOffDates(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, created_at")
      .neq("access_role", "director")
      .order("display_name", { ascending: true }),
  ]);
  // Director-only, same as everywhere else bank info shows up — a PM
  // reaching this page via can_manage_hr() never sees it here either.
  const bankInfo = isDirector ? await listStaffBankInfo() : [];

  return (
    <AttendanceBoard
      initialEntries={entries}
      initialOffDates={offDates}
      staff={(profiles ?? []) as Profile[]}
      initialBankInfo={bankInfo}
    />
  );
}
