"use server";

import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  firstOfMonth,
  isBeforeCheckInWindow,
  lastDayOfMonth,
  mondayOf,
  toVnDateString,
  vnToday,
  weekdayIndex,
} from "@/lib/constants/attendance";
import type { AttendanceEntry } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

// Director, or any staff whose chức danh is exactly "Project Manager" —
// mirrors the can_manage_hr() RLS helper in supabase/schema.sql.
async function requireHrManager() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    throw new Error("Bạn không có quyền này.");
  }
  return { supabase, user };
}

// Whether `date` (a VN calendar day, "YYYY-MM-DD") has a company-wide day
// off marked on the shared calendar (workspace/lich, category "off") — a
// director declaring a holiday there should actually stop check-ins, not
// just show a note on the calendar page.
async function isCalendarOffDay(supabase: Awaited<ReturnType<typeof createClient>>, date: string): Promise<boolean> {
  const { data } = await supabase
    .from("calendar_events")
    .select("start_at")
    .eq("category", "off")
    .gte("start_at", addDays(date, -1))
    .lte("start_at", addDays(date, 1));
  return (data ?? []).some((row) => toVnDateString(row.start_at) === date);
}

export async function checkInIfNeeded() {
  const { supabase, user } = await requireUser();
  const today = vnToday();
  const now = new Date();

  // Sunday is always off — no auto check-in. Saturday varies (sometimes a
  // work day) so it isn't excluded here.
  if (weekdayIndex(today) === 6) return;

  // A director-declared holiday on the shared calendar also skips check-in,
  // regardless of which weekday it falls on.
  if (await isCalendarOffDay(supabase, today)) return;

  // Too early to count as actually "at work" (e.g. someone browsing at 3am
  // or 8am) — don't record anything yet. This function re-runs on every
  // page load, so it just tries again on whatever page they open next,
  // recording the first one that lands at or after the check-in window.
  if (isBeforeCheckInWindow(now.toISOString())) return;

  const { data: existing } = await supabase
    .from("attendance")
    .select("id")
    .eq("profile_id", user.id)
    .eq("work_date", today)
    .maybeSingle();

  if (existing) return;

  // Best-effort: a duplicate insert from a race between two concurrent
  // requests just hits the (profile_id, work_date) unique constraint and
  // fails silently — the earliest one already recorded the real check-in
  // time, which is all that matters here.
  await supabase
    .from("attendance")
    .insert({ profile_id: user.id, work_date: today, check_in_at: now.toISOString(), status: "present" })
    .then(() => {});
}

export async function listMyMonthAttendance(monthStartInput?: string): Promise<AttendanceEntry[]> {
  const { supabase, user } = await requireUser();
  const monthStart = firstOfMonth(monthStartInput ?? vnToday());
  const monthEnd = lastDayOfMonth(monthStart);

  const { data } = await supabase
    .from("attendance")
    .select("*")
    .eq("profile_id", user.id)
    .gte("work_date", monthStart)
    .lte("work_date", monthEnd)
    .order("work_date", { ascending: true });

  return (data ?? []) as AttendanceEntry[];
}

// VN calendar dates within `monthStartInput`'s month that carry a
// company-wide "off" event on the shared calendar — used to render those
// days as "Ngày nghỉ" instead of "Chưa vào làm" across the attendance views.
export async function listOffDates(monthStartInput?: string): Promise<string[]> {
  const { supabase } = await requireUser();
  const monthStart = firstOfMonth(monthStartInput ?? vnToday());
  const monthEnd = lastDayOfMonth(monthStart);

  const { data } = await supabase
    .from("calendar_events")
    .select("start_at")
    .eq("category", "off")
    .gte("start_at", addDays(monthStart, -1))
    .lte("start_at", addDays(monthEnd, 1));

  const dates = (data ?? []).map((row) => toVnDateString(row.start_at));
  return Array.from(new Set(dates)).filter((d) => d >= monthStart && d <= monthEnd);
}

export async function listAllAttendance(weekStartInput?: string): Promise<AttendanceEntry[]> {
  const { supabase } = await requireHrManager();
  const weekStart = mondayOf(weekStartInput ?? vnToday());
  const weekEnd = addDays(weekStart, 6);

  const { data } = await supabase
    .from("attendance")
    .select("*")
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd)
    .order("work_date", { ascending: true });

  return (data ?? []) as AttendanceEntry[];
}

export async function getMonthAttendance(profileId: string, monthStartInput?: string): Promise<AttendanceEntry[]> {
  const { supabase } = await requireHrManager();
  const monthStart = firstOfMonth(monthStartInput ?? vnToday());
  const monthEnd = lastDayOfMonth(monthStart);

  const { data } = await supabase
    .from("attendance")
    .select("*")
    .eq("profile_id", profileId)
    .gte("work_date", monthStart)
    .lte("work_date", monthEnd)
    .order("work_date", { ascending: true });

  return (data ?? []) as AttendanceEntry[];
}

export async function upsertAttendance(input: {
  profileId: string;
  workDate: string;
  status: "present" | "absent" | "leave" | "off" | "paid_leave";
  checkInTime?: string; // "HH:mm", combined with workDate in VN time
  note?: string;
}) {
  const { supabase } = await requireHrManager();

  const checkInAt = input.checkInTime
    ? new Date(`${input.workDate}T${input.checkInTime}:00+07:00`).toISOString()
    : null;

  const { error } = await supabase.from("attendance").upsert(
    {
      profile_id: input.profileId,
      work_date: input.workDate,
      status: input.status,
      check_in_at: checkInAt,
      note: input.note?.trim() || null,
    },
    { onConflict: "profile_id,work_date" },
  );

  if (error) throw new Error("Không thể cập nhật chấm công");
}
