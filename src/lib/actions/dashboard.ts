"use server";

import { requireUser } from "@/lib/supabase/server";
import {
  getCumulativeNetBefore,
  getMonthlySalaryPending,
  getYearlySalaryTotals,
  listFinanceEntriesForYear,
} from "@/lib/actions/finance";
import { listWeekHourReports } from "@/lib/actions/hourReports";
import { listAllAttendance, listOffDates } from "@/lib/actions/attendance";
import { getUnreadClientMessageCount } from "@/lib/actions/clientPortal";
import { addMonths, firstOfMonth, isLateCheckIn, isOffByDefault, mondayOf, vnToday } from "@/lib/constants/attendance";
import { CUMULATIVE_START_MONTH } from "@/lib/financeSummary";
import { monthlySeries, type MonthPoint } from "@/lib/dashboardMath";

// Quản trị → Tổng quan: one director-only read of everything the overview
// shows, each part from the same action its own page uses.

export type DashboardData = {
  today: string;
  months: MonthPoint[]; // last 6, oldest first, current month last
  salaryPending: { amount: number; count: number; paidCount: number };
  attendance: { isOffDay: boolean; present: number; late: number; staffTotal: number };
  hours: { weekStart: string; totalHours: number; projects: { id: string | null; name: string; hours: number; cap: number | null }[] };
  unreadClientMessages: number;
};

const MONTHS_SHOWN = 6;

export async function getDashboardData(): Promise<DashboardData> {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle();
  if (me?.access_role !== "director") throw new Error("Chỉ Giám đốc xem được trang Tổng quan.");

  const today = vnToday();
  const thisMonth = firstOfMonth(today);
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => addMonths(thisMonth, i - (MONTHS_SHOWN - 1)));
  const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];
  const weekStart = mondayOf(today);

  const [yearEntries, yearSalaries, cumulativeBefore, salaryPending, weekHours, weekAttendance, offDates, profiles, unread] =
    await Promise.all([
      Promise.all(years.map((y) => listFinanceEntriesForYear(y))).then((r) => r.flat()),
      Promise.all(years.map((y) => getYearlySalaryTotals(y))).then((r) => Object.assign({}, ...r) as Record<string, number>),
      getCumulativeNetBefore(months[0]),
      getMonthlySalaryPending(thisMonth),
      listWeekHourReports(weekStart),
      listAllAttendance(weekStart),
      listOffDates(thisMonth),
      supabase.from("profiles").select("id, access_role").then((r) => r.data ?? []),
      getUnreadClientMessageCount().catch(() => 0),
    ]);

  // Staff who clock in — the director and content-only admins don't.
  const staffIds = new Set(profiles.filter((p) => p.access_role === "staff").map((p) => p.id as string));
  const todays = weekAttendance.filter((a) => a.work_date === today && staffIds.has(a.profile_id));
  const working = todays.filter((a) => (a.status === "present" && a.check_in_at) || a.status === "half_day");
  const late = working.filter((a) => a.check_in_at && !a.overtime && isLateCheckIn(a.check_in_at)).length;

  // Hours per project this week, biggest first.
  const byProject = new Map<string | null, number>();
  for (const h of weekHours) {
    byProject.set(h.project_channel_id, (byProject.get(h.project_channel_id) ?? 0) + h.hours + h.minutes / 60);
  }
  const projectIds = [...byProject.keys()].filter((id): id is string => !!id);
  const { data: channels } = projectIds.length
    ? await supabase.from("meeting_channels").select("id, name, weekly_hour_cap").in("id", projectIds)
    : { data: [] as { id: string; name: string; weekly_hour_cap: number | null }[] };
  const channelById = new Map((channels ?? []).map((c) => [c.id as string, c]));
  const projects = [...byProject.entries()]
    .map(([id, hours]) => {
      const c = id ? channelById.get(id) : undefined;
      return { id, name: c?.name ?? "Việc chung", hours, cap: c?.weekly_hour_cap ?? null };
    })
    .sort((a, b) => b.hours - a.hours);

  return {
    today,
    months: monthlySeries(months, yearEntries, yearSalaries, CUMULATIVE_START_MONTH, cumulativeBefore.before),
    salaryPending,
    attendance: {
      isOffDay: isOffByDefault(today, new Set(offDates)),
      present: working.length,
      late,
      staffTotal: staffIds.size,
    },
    hours: { weekStart, totalHours: projects.reduce((s, p) => s + p.hours, 0), projects },
    unreadClientMessages: unread,
  };
}
