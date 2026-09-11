"use server";

import { requireUser } from "@/lib/supabase/server";
import { sendMeetingMessage } from "@/lib/actions/meetings";
import { firstOfMonth, lastDayOfMonth, vnToday } from "@/lib/constants/attendance";
import type { HourReport } from "@/lib/types";

// Director, or any staff whose chức danh is exactly "Project Manager" —
// mirrors can_manage_hr() in supabase/schema.sql, same convention as
// requireHrManager() in lib/actions/attendance.ts.
async function requireHrManager() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    throw new Error("Bạn không có quyền này.");
  }
  return { supabase, user };
}

function formatDateVn(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

// Logs one or more hourly-rate days' work (staff catching up several days
// at once report them all together — see the "+ Thêm ngày" checklist in
// HourReportModal) AND posts the same thing as ONE normal chat message in
// whichever room the composer's "📊 Báo cáo giờ" button was clicked from
// (almost always "Chung") — staff keep reading the exact same feed they
// always have, but now there's also a structured row per day a PM can
// filter/tally on the "Báo cáo giờ" admin page instead of reading chat and
// adding hours up by hand.
export async function submitHourReports(input: {
  postChannelId: string;
  projectChannelId: string;
  projectName: string;
  entries: { workDate: string; hours: number; note: string }[];
}) {
  const { supabase, user } = await requireUser();

  if (input.entries.length === 0) throw new Error("Chưa có ngày nào để báo cáo.");
  for (const e of input.entries) {
    if (!(e.hours > 0 && e.hours <= 24)) throw new Error("Số giờ không hợp lệ (0 – 24).");
  }

  const lines = input.entries.map((e) => {
    const trimmedNote = e.note.trim();
    return `${formatDateVn(e.workDate)}${trimmedNote ? `: ${trimmedNote}` : ""} — ${e.hours} tiếng`;
  });
  const content = `📊 Báo cáo giờ — ${input.projectName}\n${lines.join("\n")}`;

  const sent = await sendMeetingMessage(input.postChannelId, content);

  const { data, error } = await supabase
    .from("hour_reports")
    .insert(
      input.entries.map((e) => ({
        profile_id: user.id,
        project_channel_id: input.projectChannelId,
        message_id: sent?.id ?? null,
        work_date: e.workDate,
        hours: e.hours,
        note: e.note.trim() || null,
      })),
    )
    .select("*");

  // The chat message already went through either way — a director checking
  // "Báo cáo giờ" and not finding these entries is a much smaller problem
  // than losing a message someone thinks they already sent.
  if (error || !data) throw new Error("Đã gửi tin nhắn nhưng chưa lưu được báo cáo giờ — thử lại giúp em nhé.");

  return { message: sent, reports: data as HourReport[] };
}

// HR-only — powers the "Báo cáo giờ" admin filter/tally page. Returns raw
// rows; the page cross-references profile_id/project_channel_id against
// the staff list and room list it already fetches, same convention as
// AttendanceBoard's `staff` prop.
export async function listHourReports(filters?: { monthStart?: string }): Promise<HourReport[]> {
  const { supabase } = await requireHrManager();
  const monthStart = firstOfMonth(filters?.monthStart ?? vnToday());
  const monthEnd = lastDayOfMonth(monthStart);

  const { data } = await supabase
    .from("hour_reports")
    .select("*")
    .gte("work_date", monthStart)
    .lte("work_date", monthEnd)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as HourReport[];
}

// Every never-reviewed report regardless of month — the "chỉ hiện chưa
// xem" toggle on the admin page reads from this instead of listHourReports
// so nothing from a prior month can go unnoticed just because no one
// happened to flip back to that month.
export async function listUnreviewedHourReports(): Promise<HourReport[]> {
  const { supabase } = await requireHrManager();
  const { data } = await supabase
    .from("hour_reports")
    .select("*")
    .is("reviewed_at", null)
    .order("work_date", { ascending: true });
  return (data ?? []) as HourReport[];
}

// Same "unreviewed" set, just ids — backs the red nav-badge dot in
// AdminSidebar, same convention as listPendingPayrollFeedbackIds().
export async function listUnreviewedHourReportIds(): Promise<string[]> {
  const { supabase } = await requireHrManager();
  const { data } = await supabase.from("hour_reports").select("id").is("reviewed_at", null);
  return (data ?? []).map((r) => r.id as string);
}

export async function markHourReportReviewed(id: string, reviewed: boolean) {
  const { supabase, user } = await requireHrManager();
  const { error } = await supabase
    .from("hour_reports")
    .update({ reviewed_at: reviewed ? new Date().toISOString() : null, reviewed_by: reviewed ? user.id : null })
    .eq("id", id);
  if (error) throw new Error("Không thể cập nhật trạng thái xem.");
}
