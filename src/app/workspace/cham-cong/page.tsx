import type { Metadata } from "next";
import { listMyAttendance } from "@/lib/actions/attendance";
import { MyAttendance } from "@/components/workspace/MyAttendance";

export const metadata: Metadata = { title: "Chấm công" };

export default async function MyAttendancePage() {
  const entries = await listMyAttendance();
  return <MyAttendance initialEntries={entries} />;
}
