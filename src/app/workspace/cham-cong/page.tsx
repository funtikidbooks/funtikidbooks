import type { Metadata } from "next";
import { listMyMonthAttendance } from "@/lib/actions/attendance";
import { MyAttendance } from "@/components/workspace/MyAttendance";

export const metadata: Metadata = { title: "Chấm công" };

export default async function MyAttendancePage() {
  const entries = await listMyMonthAttendance();
  return <MyAttendance initialEntries={entries} />;
}
