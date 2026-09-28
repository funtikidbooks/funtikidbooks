"use server";

import { revalidatePath } from "next/cache";
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
import { addDays, addMonths, firstOfMonth, isLateCheckIn, isOffByDefault, mondayOf, vnToday } from "@/lib/constants/attendance";
import { costBreakdown, CUMULATIVE_START_MONTH } from "@/lib/financeSummary";
import { isDoneColumnTitle } from "@/lib/taskProgress";
import { isArchiveColumnTitle } from "@/lib/boardTools";
import {
  hourlyCost,
  monthlySeries,
  projectProfit,
  responseStats,
  type MonthPoint,
  type ProjectProfitRow,
  type ResponseStats,
} from "@/lib/dashboardMath";
import type { FinanceEntryType, HourReport } from "@/lib/types";

// Quản trị → Tổng quan: one director-only read of everything the overview
// shows. Money comes from the same actions as Tài chính; the rest reads the
// same tables Chấm công, Báo cáo giờ, Upwork, Khách hàng and the board use.
// A part whose table isn't there yet (SQL not run) just comes back empty.

export type NamedAmount = { name: string; amount: number; type?: FinanceEntryType | "salary" };

export type DashboardData = {
  today: string;
  months: MonthPoint[]; // last 6, oldest first, current month last
  salaryPending: { amount: number; count: number; paidCount: number };
  // (4) where this month is heading if no more money comes in
  forecast: { netNow: number; unpaidSalary: number; missingFixed: NamedAmount[]; projected: number };
  // (2) this month's spending, biggest first (salary paid included)
  costs: { month: string; items: NamedAmount[]; total: number };
  // (3) revenue by source over the 6 months
  revenueSources: { items: NamedAmount[]; total: number };
  attendance: { isOffDay: boolean; present: number; late: number; staffTotal: number };
  // (6) late check-ins per month + who this month
  lateness: { months: { month: string; late: number; days: number }[]; topThisMonth: { name: string; late: number }[] };
  hours: {
    weekStart: string;
    totalHours: number;
    projects: { id: string | null; name: string; hours: number; cap: number | null }[];
  };
  // (5) this week per person
  people: { rows: { name: string; hours: number }[]; notReported: string[] };
  // (1)
  projectProfit: ProjectProfitRow[];
  projectFinanceReady: boolean;
  // (10)
  work: {
    openProjects: number;
    overdue: { title: string; who: string; daysLate: number }[];
    dueSoon: { title: string; who: string; dueIn: number }[];
  };
  // (8) last 30 days
  upwork: {
    found: number;
    drafted: number;
    approved: number;
    sent: number;
    replied: number;
    hired: number;
    // Which proposal template gets answers — needs upwork_night_email.sql.
    templates: { name: string; sent: number; replied: number }[];
  };
  // (9) last 30 days
  response: ResponseStats;
  unreadClientMessages: number;
};

const MONTHS_SHOWN = 6;

async function requireDirector() {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle();
  if (me?.access_role !== "director") throw new Error("Chỉ Giám đốc xem được trang Tổng quan.");
  return { supabase, user };
}

export async function getDashboardData(): Promise<DashboardData> {
  const { supabase } = await requireDirector();

  const today = vnToday();
  const thisMonth = firstOfMonth(today);
  const lastMonth = addMonths(thisMonth, -1);
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => addMonths(thisMonth, i - (MONTHS_SHOWN - 1)));
  const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];
  const weekStart = mondayOf(today);
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const empty = <T>() => [] as T[];

  const [
    yearEntries,
    yearSalaries,
    cumulativeBefore,
    salaryPending,
    weekHours,
    weekAttendance,
    offDates,
    profiles,
    unread,
    attendance6m,
    allHours,
    salaries,
    channels,
    projectFinance,
    columns,
    tasks,
    batches,
    leads,
    clientMessages,
  ] = await Promise.all([
    Promise.all(years.map((y) => listFinanceEntriesForYear(y))).then((r) => r.flat()),
    Promise.all(years.map((y) => getYearlySalaryTotals(y))).then((r) => Object.assign({}, ...r) as Record<string, number>),
    getCumulativeNetBefore(months[0]),
    getMonthlySalaryPending(thisMonth),
    listWeekHourReports(weekStart),
    listAllAttendance(weekStart),
    listOffDates(thisMonth),
    supabase
      .from("profiles")
      .select("id, display_name, access_role")
      .then((r) => r.data ?? []),
    getUnreadClientMessageCount().catch(() => 0),
    supabase
      .from("attendance")
      .select("profile_id, work_date, check_in_at, status, overtime")
      .gte("work_date", months[0])
      .lte("work_date", today)
      .then((r) => r.data ?? []),
    supabase
      .from("hour_reports")
      .select("project_channel_id, profile_id, hours, minutes")
      .then((r) => (r.data ?? []) as HourReport[]),
    supabase
      .from("staff_salary")
      .select("profile_id, monthly_salary, standard_work_days")
      .then((r) => r.data ?? []),
    supabase
      .from("meeting_channels")
      .select("id, name, is_general, is_food_room, closed_at, weekly_hour_cap")
      .then((r) => r.data ?? []),
    supabase
      .from("project_finance")
      .select("channel_id, revenue_vnd")
      .then((r) => ({ ok: !r.error, rows: r.data ?? [] })),
    supabase
      .from("board_columns")
      .select("id, title")
      .then((r) => r.data ?? []),
    supabase
      .from("tasks")
      .select("id, title, column_id, due_date, assignee_id")
      .not("due_date", "is", null)
      .lte("due_date", addDays(today, 3))
      .then((r) => r.data ?? []),
    supabase
      .from("upwork_batches")
      .select("jobs_found")
      .gte("ran_at", since30)
      .then((r) => r.data ?? empty<{ jobs_found: number }>()),
    supabase
      .from("upwork_leads")
      .select("status, template_name")
      .gte("created_at", since30)
      .then(async (r) => {
        if (!r.error) return (r.data ?? []) as { status: string; template_name: string | null }[];
        // template_name not added yet — the funnel still works without it.
        const plain = await supabase.from("upwork_leads").select("status").gte("created_at", since30);
        return (plain.data ?? []).map((l) => ({ status: l.status as string, template_name: null }));
      }),
    supabase
      .from("client_messages")
      .select("project_id, sender_type, created_at")
      .gte("created_at", since30)
      .then((r) => r.data ?? []),
  ]);

  const nameOf = new Map(profiles.map((p) => [p.id as string, p.display_name as string]));
  const staffIds = new Set(profiles.filter((p) => p.access_role === "staff").map((p) => p.id as string));

  // --- money -------------------------------------------------------------
  const series = monthlySeries(months, yearEntries, yearSalaries, CUMULATIVE_START_MONTH, cumulativeBefore.before);
  const current = series[series.length - 1];

  const thisMonthEntries = yearEntries.filter((e) => e.entry_month === thisMonth);
  const costItems: NamedAmount[] = costBreakdown(thisMonthEntries).map((c) => ({
    name: c.category,
    amount: c.amount,
    type: c.type,
  }));
  if (current.salary > 0) costItems.push({ name: "Lương đã trả", amount: current.salary, type: "salary" });
  costItems.sort((a, b) => b.amount - a.amount);

  const revenueByCategory = new Map<string, number>();
  for (const e of yearEntries) {
    if (e.type !== "revenue" || e.entry_month < months[0] || e.entry_month > thisMonth) continue;
    revenueByCategory.set(e.category, (revenueByCategory.get(e.category) ?? 0) + Number(e.amount));
  }
  const revenueItems = [...revenueByCategory.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Định phí paid last month but not entered yet this month — rent, tools…
  const thisMonthCategories = new Set(thisMonthEntries.filter((e) => e.type === "fixed_cost").map((e) => e.category));
  const missingFixed: NamedAmount[] = [];
  for (const e of yearEntries) {
    if (e.entry_month !== lastMonth || e.type !== "fixed_cost" || thisMonthCategories.has(e.category)) continue;
    const found = missingFixed.find((m) => m.name === e.category);
    if (found) found.amount += Number(e.amount);
    else missingFixed.push({ name: e.category, amount: Number(e.amount), type: "fixed_cost" });
  }
  const missingFixedTotal = missingFixed.reduce((s, m) => s + m.amount, 0);

  // --- people ------------------------------------------------------------
  const todays = weekAttendance.filter((a) => a.work_date === today && staffIds.has(a.profile_id));
  const working = todays.filter((a) => (a.status === "present" && a.check_in_at) || a.status === "half_day");
  const lateToday = working.filter((a) => a.check_in_at && !a.overtime && isLateCheckIn(a.check_in_at)).length;

  const lateMonths = months.map((m) => ({ month: m, late: 0, days: 0 }));
  const lateThisMonth = new Map<string, number>();
  for (const a of attendance6m) {
    if (!staffIds.has(a.profile_id) || a.status !== "present" || !a.check_in_at) continue;
    const bucket = lateMonths.find((m) => m.month === firstOfMonth(a.work_date));
    if (!bucket) continue;
    bucket.days++;
    if (!a.overtime && isLateCheckIn(a.check_in_at)) {
      bucket.late++;
      if (bucket.month === thisMonth) lateThisMonth.set(a.profile_id, (lateThisMonth.get(a.profile_id) ?? 0) + 1);
    }
  }

  const channelById = new Map(channels.map((c) => [c.id as string, c]));
  const byProject = new Map<string | null, number>();
  const byPerson = new Map<string, number>();
  for (const h of weekHours) {
    const hrs = h.hours + h.minutes / 60;
    byProject.set(h.project_channel_id, (byProject.get(h.project_channel_id) ?? 0) + hrs);
    byPerson.set(h.profile_id, (byPerson.get(h.profile_id) ?? 0) + hrs);
  }
  const projectHours = [...byProject.entries()]
    .map(([id, hours]) => {
      const c = id ? channelById.get(id) : undefined;
      return { id, name: (c?.name as string) ?? "Việc chung", hours, cap: (c?.weekly_hour_cap as number | null) ?? null };
    })
    .sort((a, b) => b.hours - a.hours);

  // --- projects ----------------------------------------------------------
  const projectRooms = channels.filter((c) => !c.is_general && !c.is_food_room);
  const hourlyByProfile = new Map(
    salaries.map((s) => [s.profile_id as string, hourlyCost(Number(s.monthly_salary), Number(s.standard_work_days))]),
  );
  const revenueByProject = new Map(projectFinance.rows.map((r) => [r.channel_id as string, Number(r.revenue_vnd)]));
  const profitRows = projectProfit(
    projectRooms.map((c) => ({ id: c.id as string, name: c.name as string })),
    allHours,
    hourlyByProfile,
    revenueByProject,
  ).sort((a, b) => b.hours - a.hours);

  // Archived cards (the hidden "📦 Lưu trữ" list) count as finished too.
  const doneColumns = new Set(
    columns.filter((c) => isDoneColumnTitle(c.title as string) || isArchiveColumnTitle(c.title as string)).map((c) => c.id as string),
  );
  const openTasks = tasks.filter((t) => !doneColumns.has(t.column_id as string));
  const daysFrom = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const who = (id: string | null) => (id ? (nameOf.get(id) ?? "—") : "Chưa giao");
  const overdue = openTasks
    .filter((t) => (t.due_date as string) < today)
    .map((t) => ({
      title: t.title as string,
      who: who(t.assignee_id as string | null),
      daysLate: -daysFrom(t.due_date as string),
    }))
    .sort((a, b) => b.daysLate - a.daysLate);
  const dueSoon = openTasks
    .filter((t) => (t.due_date as string) >= today)
    .map((t) => ({ title: t.title as string, who: who(t.assignee_id as string | null), dueIn: daysFrom(t.due_date as string) }))
    .sort((a, b) => a.dueIn - b.dueIn);

  // --- customers ---------------------------------------------------------
  const count = (...statuses: string[]) => leads.filter((l) => statuses.includes(l.status)).length;
  const byTemplate = new Map<string, { sent: number; replied: number }>();
  for (const l of leads) {
    if (!l.template_name || !["sent", "replied", "hired"].includes(l.status)) continue;
    const t = byTemplate.get(l.template_name) ?? { sent: 0, replied: 0 };
    t.sent++;
    if (l.status !== "sent") t.replied++;
    byTemplate.set(l.template_name, t);
  }

  return {
    today,
    months: series,
    salaryPending,
    forecast: {
      netNow: current.net,
      unpaidSalary: salaryPending.amount,
      missingFixed,
      projected: current.net - salaryPending.amount - missingFixedTotal,
    },
    costs: { month: thisMonth, items: costItems, total: costItems.reduce((s, c) => s + c.amount, 0) },
    revenueSources: { items: revenueItems, total: revenueItems.reduce((s, r) => s + r.amount, 0) },
    attendance: {
      isOffDay: isOffByDefault(today, new Set(offDates)),
      present: working.length,
      late: lateToday,
      staffTotal: staffIds.size,
    },
    lateness: {
      months: lateMonths,
      topThisMonth: [...lateThisMonth.entries()]
        .map(([id, late]) => ({ name: nameOf.get(id) ?? "—", late }))
        .sort((a, b) => b.late - a.late)
        .slice(0, 5),
    },
    hours: { weekStart, totalHours: projectHours.reduce((s, p) => s + p.hours, 0), projects: projectHours },
    people: {
      rows: [...byPerson.entries()]
        .filter(([id]) => staffIds.has(id))
        .map(([id, hours]) => ({ name: nameOf.get(id) ?? "—", hours }))
        .sort((a, b) => b.hours - a.hours),
      notReported: [...staffIds].filter((id) => !byPerson.has(id)).map((id) => nameOf.get(id) ?? "—"),
    },
    projectProfit: profitRows,
    projectFinanceReady: projectFinance.ok,
    work: {
      openProjects: projectRooms.filter((c) => !c.closed_at).length,
      overdue,
      dueSoon,
    },
    upwork: {
      found: batches.reduce((s, b) => s + Number(b.jobs_found ?? 0), 0),
      drafted: leads.length,
      approved: count("approved", "sent", "replied", "hired"),
      sent: count("sent", "replied", "hired"),
      replied: count("replied", "hired"),
      hired: count("hired"),
      templates: [...byTemplate.entries()]
        .map(([name, t]) => ({ name, ...t }))
        .sort((a, b) => b.replied / b.sent - a.replied / a.sent || b.sent - a.sent),
    },
    response: responseStats(
      clientMessages as { project_id: string; sender_type: "client" | "staff"; created_at: string }[],
      Date.now(),
    ),
    unreadClientMessages: unread,
  };
}

// (1) Tiền thu của một dự án, typed in on Tổng quan.
export async function setProjectRevenue(channelId: string, revenueVnd: number) {
  const { supabase, user } = await requireDirector();
  const amount = Math.max(0, Math.round(revenueVnd));
  const { error } = await supabase
    .from("project_finance")
    .upsert({ channel_id: channelId, revenue_vnd: amount, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) {
    throw new Error(
      /project_finance/.test(error.message)
        ? "Chưa chạy file SQL dashboard_extras.sql trên Supabase."
        : "Không lưu được số tiền.",
    );
  }
  revalidatePath("/quan-tri/tong-quan");
}
