import type { Metadata } from "next";
import { listMyMonthAttendance, listOffDates } from "@/lib/actions/attendance";
import { getMyAdvances } from "@/lib/actions/salaryAdvances";
import { MyAttendance } from "@/components/workspace/MyAttendance";
import { SalaryAdvancePanel } from "@/components/workspace/SalaryAdvancePanel";
import { HydrationProbe } from "@/components/workspace/HydrationProbe";
import { firstOfMonth, vnToday } from "@/lib/constants/attendance";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chấm công" };

export default async function MyAttendancePage() {
  const { user } = await requireUser();
  const [entries, offDates, advances] = await Promise.all([listMyMonthAttendance(), listOffDates(), getMyAdvances()]);
  return (
    <>
      <MyAttendance
        initialEntries={entries}
        initialOffDates={offDates}
        currentUserId={user.id}
        aside={
          advances.eligible ? (
            <SalaryAdvancePanel monthStart={firstOfMonth(vnToday())} currentUserId={user.id} initialRequests={advances.requests} />
          ) : undefined
        }
      />
      <HydrationProbe />
    </>
  );
}
