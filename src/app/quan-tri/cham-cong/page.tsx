import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { listAllAttendance, listOffDates } from "@/lib/actions/attendance";
import { AttendanceBoard } from "@/components/admin/AttendanceBoard";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Quản trị — Chấm công" };

// The studio's actual owner — the one account excluded from this board,
// since an owner doesn't clock in/out. Excluding by access_role="director"
// used to also work, back when that was the only director account, but
// Yuna now also holds director-level access (for other admin permissions)
// while still being tracked as regular staff — so this is keyed off her
// specific id instead of the role.
const OWNER_PROFILE_ID = "1fe95dd5-f7dd-46c7-bc9a-6b4c837f4f2a";

export default async function AdminAttendancePage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    redirect("/quan-tri");
  }

  const [entries, offDates, { data: profiles }] = await Promise.all([
    listAllAttendance(),
    listOffDates(),
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, role, phone, address, access_role, joined_at, created_at")
      .neq("id", OWNER_PROFILE_ID)
      .order("display_name", { ascending: true }),
  ]);

  return <AttendanceBoard initialEntries={entries} initialOffDates={offDates} staff={(profiles ?? []) as Profile[]} />;
}
