"use server";

import { after } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { addDays, firstOfMonth, toVnDateString, vnToday } from "@/lib/constants/attendance";
import { sendPushToUser, sendPushToUsers } from "@/lib/push";
import { syncPayrollForAttendanceChange } from "@/lib/payrollSync";
import { LEAVE_MAX_DAYS, LEAVE_SELECT, leaveRangeLabel, leaveWorkDays } from "@/lib/leave";
import type { AttendanceEntry, LeaveRequest } from "@/lib/types";

// Đơn xin nghỉ (supabase/migrations/leave_requests.sql). Notifications say
// who and when, never the reason — a lock screen is often in plain view.

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

async function requireHrManager() {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (me?.access_role !== "director" && me?.role !== "Project Manager") throw new Error("Bạn không có quyền này.");
  return { supabase, user };
}

// The company's days off (shared calendar, category "off") between two dates.
async function offDatesBetween(supabase: Supabase, start: string, end: string): Promise<string[]> {
  const { data } = await supabase
    .from("calendar_events")
    .select("start_at")
    .eq("category", "off")
    .gte("start_at", addDays(start, -1))
    .lte("start_at", addDays(end, 1));
  return (data ?? []).map((r) => toVnDateString(r.start_at as string)).filter((d) => d >= start && d <= end);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The caller's own requests, newest first.
export async function getMyLeaveRequests(): Promise<LeaveRequest[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("leave_requests")
    .select(LEAVE_SELECT)
    .eq("profile_id", user.id)
    .order("start_date", { ascending: false })
    .limit(50);
  return (data ?? []) as LeaveRequest[];
}

export async function requestLeave(input: { start: string; end: string; halfDay: boolean; reason: string }): Promise<LeaveRequest> {
  const { supabase, user } = await requireUser();
  const { start, end } = input;
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) throw new Error("Ngày không hợp lệ.");
  if (start < vnToday()) throw new Error("Chỉ xin nghỉ được từ hôm nay trở đi.");
  if (end < start) throw new Error("Ngày kết thúc phải sau ngày bắt đầu.");
  if (input.halfDay && start !== end) throw new Error("Nghỉ nửa ngày chỉ chọn được một ngày.");
  if (leaveWorkDays(start, end).length === 0) throw new Error("Khoảng này toàn ngày nghỉ sẵn rồi.");
  if (Date.parse(end) - Date.parse(start) > (LEAVE_MAX_DAYS - 1) * 86400e3) throw new Error(`Một đơn xin nghỉ tối đa ${LEAVE_MAX_DAYS} ngày.`);

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({ profile_id: user.id, start_date: start, end_date: end, half_day: input.halfDay, reason: input.reason.trim().slice(0, 300) || null })
    .select(LEAVE_SELECT)
    .single();
  if (error || !data) throw new Error("Chưa gửi được đơn, bạn thử lại nhé.");
  const saved = data as LeaveRequest;

  after(async () => {
    const [{ data: me }, { data: managers }] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      supabase.from("profiles").select("id").or("access_role.eq.director,role.eq.Project Manager"),
    ]);
    await sendPushToUsers(
      (managers ?? []).map((m) => m.id as string).filter((id) => id !== user.id),
      {
        title: "🗓 Đơn xin nghỉ mới",
        body: `${me?.display_name ?? "Một bạn"} xin nghỉ ${leaveRangeLabel(saved)}. Bấm để duyệt.`,
        senderId: user.id,
        url: "/quan-tri/cham-cong",
        tag: `funti-leave-${saved.id}`,
      },
    ).catch(() => {});
  });

  return saved;
}

export async function cancelMyLeave(id: string): Promise<LeaveRequest> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .select(LEAVE_SELECT)
    .maybeSingle();
  if (error || !data) throw new Error("Đơn này đã được xử lý nên không huỷ được nữa.");
  return data as LeaveRequest;
}

// Quản trị → Chấm công: everything waiting, plus the last two months' decisions.
export async function listLeaveForManagers(): Promise<LeaveRequest[]> {
  const { supabase } = await requireHrManager();
  const since = addDays(vnToday(), -60);
  const { data } = await supabase
    .from("leave_requests")
    .select(LEAVE_SELECT)
    .or(`status.eq.pending,start_date.gte.${since}`)
    .order("start_date", { ascending: true })
    .limit(300);
  return (data ?? []) as LeaveRequest[];
}

// The Quản trị menu's red dot (Giám đốc and PM).
export async function listPendingLeaveIds(): Promise<string[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("leave_requests").select("id").eq("status", "pending");
  return (data ?? []).map((r) => r.id as string);
}

// Duyệt (paid or not) / Không duyệt. Approving marks each work day of the
// request on the attendance board and recomputes that month's payroll.
export async function decideLeave(id: string, decision: { approve: boolean; paid?: boolean; note?: string }): Promise<LeaveRequest> {
  const { supabase, user } = await requireHrManager();
  const note = decision.note?.trim().slice(0, 300) || null;
  const { data, error } = await supabase
    .from("leave_requests")
    .update({
      status: decision.approve ? "approved" : "rejected",
      paid: decision.approve ? !!decision.paid : null,
      decision_note: note,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select(LEAVE_SELECT)
    .maybeSingle();
  if (error || !data) throw new Error("Đơn này đã được xử lý rồi (hoặc bị huỷ).");
  const saved = data as LeaveRequest;

  if (saved.status === "approved") {
    const days = leaveWorkDays(saved.start_date, saved.end_date, await offDatesBetween(supabase, saved.start_date, saved.end_date));
    const status: AttendanceEntry["status"] = saved.half_day ? "half_day" : saved.paid ? "paid_leave" : "leave";
    // The reason stays on the request — everyone can read attendance.
    const rows = days.map((work_date) => ({
      profile_id: saved.profile_id,
      work_date,
      status,
      check_in_at: null,
      note: saved.half_day ? "Nghỉ nửa ngày (đơn đã duyệt)" : "Nghỉ phép (đơn đã duyệt)",
    }));
    if (rows.length > 0) {
      const { error: attError } = await supabase.from("attendance").upsert(rows, { onConflict: "profile_id,work_date" });
      if (attError) {
        // Put the request back so it can be approved again once this works.
        await supabase.from("leave_requests").update({ status: "pending", paid: null, decided_at: null }).eq("id", id);
        throw new Error("Chưa ghi được ngày nghỉ vào chấm công, thử lại nhé.");
      }
      for (const month of new Set(days.map((d) => firstOfMonth(d)))) {
        try {
          await syncPayrollForAttendanceChange(supabase, saved.profile_id, month);
        } catch {
          // The nightly sync catches up.
        }
      }
    }
  }

  after(() =>
    sendPushToUser(saved.profile_id, {
      title: saved.status === "approved" ? "✓ Đơn xin nghỉ đã được duyệt" : "Đơn xin nghỉ chưa được duyệt",
      body: `${leaveRangeLabel(saved)} — mở Chấm công để xem chi tiết.`,
      senderId: user.id,
      url: "/workspace/cham-cong",
      tag: `funti-leave-${saved.id}`,
    }).then(
      () => {},
      () => {},
    ),
  );

  return saved;
}
