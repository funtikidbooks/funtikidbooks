"use server";

import { createClient } from "@/lib/supabase/server";
import { addDays, mondayOf, vnToday } from "@/lib/constants/attendance";
import type { AttendanceEntry } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

async function requireDirector() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle();
  if (profile?.access_role !== "director") {
    throw new Error("Chỉ Giám đốc mới có quyền này.");
  }
  return { supabase, user };
}

export async function checkInIfNeeded() {
  const { supabase, user } = await requireUser();
  const today = vnToday();

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
    .insert({ profile_id: user.id, work_date: today, check_in_at: new Date().toISOString(), status: "present" })
    .then(() => {});
}

export async function listMyAttendance(weekStartInput?: string): Promise<AttendanceEntry[]> {
  const { supabase, user } = await requireUser();
  const weekStart = mondayOf(weekStartInput ?? vnToday());
  const weekEnd = addDays(weekStart, 6);

  const { data } = await supabase
    .from("attendance")
    .select("*")
    .eq("profile_id", user.id)
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd)
    .order("work_date", { ascending: true });

  return (data ?? []) as AttendanceEntry[];
}

export async function listAllAttendance(weekStartInput?: string): Promise<AttendanceEntry[]> {
  const { supabase } = await requireDirector();
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

export async function upsertAttendance(input: {
  profileId: string;
  workDate: string;
  status: "present" | "absent" | "leave";
  checkInTime?: string; // "HH:mm", combined with workDate in VN time
  note?: string;
}) {
  const { supabase } = await requireDirector();

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
