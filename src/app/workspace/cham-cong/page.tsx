import type { Metadata } from "next";
import { listMyMonthAttendance, listOffDates } from "@/lib/actions/attendance";
import { MyAttendance } from "@/components/workspace/MyAttendance";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chấm công" };

export default async function MyAttendancePage() {
  const { user } = await requireUser();
  const [entries, offDates] = await Promise.all([listMyMonthAttendance(), listOffDates()]);
  return <MyAttendance initialEntries={entries} initialOffDates={offDates} currentUserId={user.id} />;
}
