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

// Logs an hourly-rate day's work AND posts the same thing as a normal chat
// message in whichever room the composer's "📊 Báo cáo giờ" button was
// clicked from (almost always "Chung") — staff keep reading the exact same
// feed they always have, but now there's also a structured row a PM can
// filter/tally on the "Báo cáo giờ" admin page instead of reading chat and
// adding hours up by hand.
export async function submitHourReport(input: {
  postChannelId: string;
  projectChannelId: string;
  projectName: string;
  workDate: string;
  hours: number;
  note: string;
}) {
  const { supabase, user } = await requireUser();

  if (!(input.hours > 0 && input.hours <= 24)) throw new Error("Số giờ không hợp lệ (0 – 24).");
  const trimmedNote = input.note.trim();

  const content = `📊 Báo cáo giờ — ${input.projectName}\n${formatDateVn(input.workDate)}${trimmedNote ? `: ${trimmedNote}` : ""} — ${input.hours} tiếng`;

  const sent = await sendMeetingMessage(input.postChannelId, content);

  const { data, error } = await supabase
    .from("hour_reports")
    .insert({
      profile_id: user.id,
      project_channel_id: input.projectChannelId,
      message_id: sent?.id ?? null,
      work_date: input.workDate,
      hours: input.hours,
      note: trimmedNote || null,
    })
    .select("*")
    .single();

  // The chat message already went through either way — a director checking
  // "Báo cáo giờ" and not finding this one entry is a much smaller problem
  // than losing a message someone thinks they already sent.
  if (error || !data) throw new Error("Đã gửi tin nhắn nhưng chưa lưu được báo cáo giờ — thử lại giúp em nhé.");

  return { message: sent, report: data as HourReport };
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
