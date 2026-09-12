"use server";

import { requireUser } from "@/lib/supabase/server";
import { addDays } from "@/lib/constants/attendance";
import type { HourReport } from "@/lib/types";

// Director, or any staff whose chức danh is exactly "Project Manager" —
// mirrors can_manage_hr() in supabase/schema.sql, same convention as
// requireHrManager() in lib/actions/attendance.ts. Only setProjectWeeklyCap
// needs this — logging/reading hours is open to every staff member.
async function requireHrManager() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    throw new Error("Bạn không có quyền này.");
  }
  return { supabase, user };
}

// One row per (person, project, day) — re-logging the same day updates it
// in place (see the unique index in supabase/migrations/hour_reports.sql)
// instead of piling up duplicate entries the way separate chat messages
// would have.
export async function logHours(input: {
  projectChannelId: string;
  workDate: string;
  hours: number;
  minutes: number;
  note?: string;
}) {
  const { supabase, user } = await requireUser();
  if (!(input.hours >= 0 && input.hours <= 24)) throw new Error("Số giờ không hợp lệ (0 – 24).");
  if (!(input.minutes >= 0 && input.minutes <= 59)) throw new Error("Số phút không hợp lệ (0 – 59).");
  const totalMinutes = input.hours * 60 + input.minutes;
  if (!(totalMinutes > 0 && totalMinutes <= 24 * 60)) throw new Error("Thời lượng không hợp lệ.");

  const { data, error } = await supabase
    .from("hour_reports")
    .upsert(
      {
        profile_id: user.id,
        project_channel_id: input.projectChannelId,
        work_date: input.workDate,
        hours: input.hours,
        minutes: input.minutes,
        note: input.note?.trim() || null,
      },
      { onConflict: "profile_id,project_channel_id,work_date" },
    )
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể lưu giờ — thử lại giúp em nhé.");
  return data as HourReport;
}

// Clearing a cell back to empty — RLS restricts this to the report's own
// owner (or an HR manager correcting someone else's entry).
export async function deleteHourEntry(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("hour_reports").delete().eq("id", id);
  if (error) throw new Error("Không thể xoá giờ này.");
}

// Every hour_reports row within a Mon–Sun week, across every project and
// every staff member — the "Báo cáo giờ" timesheet is a shared, open-read
// table (everyone can already read every entry), so this needs no
// per-viewer filtering the way listMyMonthAttendance does.
export async function listWeekHourReports(weekStart: string): Promise<HourReport[]> {
  const { supabase } = await requireUser();
  const weekEnd = addDays(weekStart, 6);

  const { data } = await supabase
    .from("hour_reports")
    .select("*")
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd);

  return (data ?? []) as HourReport[];
}

// Director/PM-only — the weekly hour budget shown as a filling progress
// bar per project row on the timesheet.
export async function setProjectWeeklyCap(channelId: string, cap: number | null) {
  const { supabase } = await requireHrManager();
  if (cap !== null && !(cap > 0 && cap <= 999)) throw new Error("Số giờ tối đa không hợp lệ.");
  const { error } = await supabase.from("meeting_channels").update({ weekly_hour_cap: cap }).eq("id", channelId);
  if (error) throw new Error("Không thể cập nhật giờ tối đa.");
}
