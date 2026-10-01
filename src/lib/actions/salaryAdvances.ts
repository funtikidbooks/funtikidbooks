"use server";

import { after } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { addMonths, firstOfMonth, vnToday } from "@/lib/constants/attendance";
import { sendPushToUser, sendPushToUsers } from "@/lib/push";
import { ADVANCE_MAX, ADVANCE_MIN, SALARY_ADVANCE_SELECT, toSalaryAdvance } from "@/lib/salaryAdvance";
import type { SalaryAdvance } from "@/lib/types";

// Ứng tiền trước (supabase/migrations/salary_advances.sql). Notifications
// never carry the amount or the reason — a lock screen is often in plain
// view of colleagues.

// Who can ask: anyone paid through payroll, a Giám đốc included (who may
// approve their own).
async function canAskForAdvance(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string) {
  const { data: salary } = await supabase.from("staff_salary").select("monthly_salary").eq("profile_id", userId).maybeSingle();
  return Number(salary?.monthly_salary ?? 0) > 0;
}

export async function getMyAdvances(): Promise<{ eligible: boolean; requests: SalaryAdvance[] }> {
  const { supabase, user } = await requireUser();
  const [eligible, { data }] = await Promise.all([
    canAskForAdvance(supabase, user.id),
    supabase.from("salary_advances").select(SALARY_ADVANCE_SELECT).eq("profile_id", user.id).order("requested_at", { ascending: false }).limit(30),
  ]);
  return { eligible, requests: (data ?? []).map(toSalaryAdvance) };
}

export async function requestAdvance(amountInput: number, reasonInput: string): Promise<SalaryAdvance> {
  const { supabase, user } = await requireUser();
  const amount = Math.round(Number(amountInput));
  if (!Number.isFinite(amount) || amount < ADVANCE_MIN) throw new Error("Số tiền ứng tối thiểu là 1.000.000 ₫.");
  if (amount > ADVANCE_MAX) throw new Error("Số tiền này lớn quá, bạn kiểm tra lại nhé.");
  if (!(await canAskForAdvance(supabase, user.id))) throw new Error("Tài khoản này chưa có bảng lương nên chưa ứng được.");
  const reason = reasonInput.trim().slice(0, 300) || null;

  const { data, error } = await supabase
    .from("salary_advances")
    .insert({ profile_id: user.id, amount, reason })
    .select(SALARY_ADVANCE_SELECT)
    .single();
  if (error || !data) throw new Error("Chưa gửi được yêu cầu, bạn thử lại nhé.");
  const saved = toSalaryAdvance(data);

  // after(): an un-awaited promise can be cut off on Vercel once the
  // response is sent (same note as addMyPayrollFeedback in payroll.ts).
  after(async () => {
    const [{ data: me }, { data: directors }] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      supabase.from("profiles").select("id").eq("access_role", "director"),
    ]);
    await sendPushToUsers(
      (directors ?? []).map((d) => d.id as string).filter((id) => id !== user.id),
      {
        title: "💸 Yêu cầu ứng tiền mới",
        body: `${me?.display_name ?? "Một bạn"} vừa gửi yêu cầu ứng tiền. Bấm để xem.`,
        senderId: user.id,
        url: "/quan-tri/cham-cong",
        tag: `funti-advance-${saved.id}`,
      },
    ).catch(() => {});
  });

  return saved;
}

export async function cancelMyAdvance(id: string): Promise<SalaryAdvance> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("salary_advances")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .select(SALARY_ADVANCE_SELECT)
    .maybeSingle();
  if (error || !data) throw new Error("Yêu cầu này đã được xử lý nên không huỷ được nữa.");
  return toSalaryAdvance(data);
}

// The admin menu's red dot on Nhân sự › Chấm công. Only ever called for a
// Giám đốc (quan-tri/layout.tsx); the table's policy would leave anyone
// else just their own.
export async function listPendingAdvanceIds(): Promise<string[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("salary_advances").select("id").eq("status", "pending");
  return (data ?? []).map((r) => r.id as string);
}

export type AdvancesForDirectors = {
  requests: SalaryAdvance[];
  // Per person, the payslip months (this month / next) already paid — an
  // advance can't come off those.
  paidMonths: Record<string, string[]>;
};

// Quản trị → Chấm công: everything still waiting, plus the last ~4 months'
// decisions. Giám đốc only — not a PM (the table's own policy is the real gate).
export async function listAdvancesForDirectors(): Promise<AdvancesForDirectors> {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role").eq("id", user.id).maybeSingle();
  if (me?.access_role !== "director") throw new Error("Bạn không có quyền này.");

  const thisMonth = firstOfMonth(vnToday());
  const since = addMonths(thisMonth, -3);
  const { data } = await supabase
    .from("salary_advances")
    .select(SALARY_ADVANCE_SELECT)
    .or(`status.eq.pending,requested_at.gte.${since}`)
    .order("requested_at", { ascending: false })
    .limit(300);
  const requests = (data ?? []).map(toSalaryAdvance);

  const people = [...new Set(requests.filter((r) => r.status === "pending").map((r) => r.profile_id))];
  const paidMonths: Record<string, string[]> = {};
  if (people.length > 0) {
    const { data: paid } = await supabase
      .from("payroll_records")
      .select("profile_id, month")
      .eq("status", "paid")
      .in("profile_id", people)
      .in("month", [thisMonth, addMonths(thisMonth, 1)]);
    for (const p of paid ?? []) (paidMonths[p.profile_id as string] ??= []).push(p.month as string);
  }
  return { requests, paidMonths };
}

export async function decideAdvance(
  id: string,
  decision: { approve: boolean; amount?: number; month?: string; note?: string },
): Promise<SalaryAdvance> {
  const { supabase, user } = await requireUser();
  const amount = decision.approve ? Math.round(Number(decision.amount)) : null;
  if (decision.approve && (!amount || amount <= 0 || amount > ADVANCE_MAX)) throw new Error("Số tiền duyệt không hợp lệ.");

  // The database function re-checks everything: Giám đốc only, still
  // waiting, that month's payslip not paid yet.
  const { data, error } = await supabase.rpc("decide_salary_advance", {
    p_id: id,
    p_approve: decision.approve,
    p_amount: amount,
    p_month: decision.approve ? decision.month : null,
    p_note: decision.note?.trim().slice(0, 300) || null,
  });
  if (error || !data) throw new Error(error?.message || "Chưa lưu được, thử lại nhé.");
  const saved = toSalaryAdvance(data as Record<string, unknown>);

  after(() =>
    sendPushToUser(saved.profile_id, {
      title: saved.status === "approved" ? "✓ Yêu cầu ứng tiền đã được duyệt" : "Yêu cầu ứng tiền chưa được duyệt lần này",
      body: "Mở Chấm công để xem chi tiết.",
      senderId: user.id,
      url: "/workspace/cham-cong",
      tag: `funti-advance-${saved.id}`,
    }).then(
      () => {},
      () => {},
    ),
  );

  return saved;
}
