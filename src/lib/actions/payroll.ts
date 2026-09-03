"use server";

import { after } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { firstOfMonth, vnToday } from "@/lib/constants/attendance";
import { sendPushToUser } from "@/lib/push";
import { sendPayslipEmail } from "@/lib/mail";
import type {
  PayrollConfirmation,
  PayrollFeedback,
  PayrollFeedbackStatus,
  PayrollItem,
  PayrollRecord,
  PayrollStatus,
  StaffBankInfo,
  StaffSalary,
} from "@/lib/types";

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

export async function listPayrollForMonth(monthStartInput?: string): Promise<PayrollRecord[]> {
  const { supabase } = await requireHrManager();
  const monthStart = firstOfMonth(monthStartInput ?? vnToday());
  const { data } = await supabase.from("payroll_records").select("*").eq("month", monthStart);
  return (data ?? []) as PayrollRecord[];
}

export async function getPayrollById(id: string): Promise<PayrollRecord | null> {
  const { supabase } = await requireHrManager();
  const { data } = await supabase.from("payroll_records").select("*").eq("id", id).maybeSingle();
  return (data as PayrollRecord) ?? null;
}

export async function upsertPayroll(input: {
  profileId: string;
  month: string;
  baseSalary: number;
  workDays: number | null;
  items: PayrollItem[];
  status: PayrollStatus;
  note?: string;
}): Promise<PayrollRecord> {
  const { supabase, user } = await requireHrManager();
  const month = firstOfMonth(input.month);

  const { data, error } = await supabase
    .from("payroll_records")
    .upsert(
      {
        profile_id: input.profileId,
        month,
        base_salary: input.baseSalary,
        work_days: input.workDays,
        items: input.items,
        status: input.status,
        note: input.note?.trim() || null,
        created_by: user.id,
      },
      { onConflict: "profile_id,month" },
    )
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể lưu bảng lương");

  // Any director edit invalidates a prior "I checked this and it's right"
  // from the employee — they confirmed different numbers. Best-effort: the
  // save itself already succeeded, so a failure here just leaves a stale
  // confirmation rather than losing the director's edit.
  try {
    await supabase.from("payroll_confirmations").delete().eq("payroll_record_id", data.id);
  } catch {
    // ignore — see comment above
  }

  return data as PayrollRecord;
}

export async function deletePayroll(id: string) {
  const { supabase } = await requireHrManager();
  await supabase.from("payroll_records").delete().eq("id", id);
}

// One payslip, emailed to the employee's own login address — mirrors
// PayrollPrintView.tsx's numbers exactly (same base_salary/items/status),
// so the email and the printable PDF for the same record never disagree.
export async function sendPayrollEmail(payrollRecordId: string): Promise<void> {
  const { supabase } = await requireHrManager();
  const { data: record } = await supabase.from("payroll_records").select("*").eq("id", payrollRecordId).maybeSingle();
  if (!record) throw new Error("Không tìm thấy bảng lương.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, display_name")
    .eq("id", record.profile_id)
    .maybeSingle();
  if (!profile?.email) throw new Error("Nhân viên chưa có email.");

  await sendPayslipEmail({
    to: profile.email,
    displayName: profile.display_name,
    month: record.month,
    workDays: record.work_days,
    baseSalary: record.base_salary,
    items: record.items as PayrollItem[],
    status: record.status as "draft" | "paid",
    note: record.note,
  });
}

// Bulk version for "send this month's payslips to everyone" — best-effort
// per record so one bad email address doesn't block the rest of the team;
// the caller gets a sent/failed count back to show the director.
export async function sendPayrollEmailsForMonth(monthStartInput?: string): Promise<{ sent: number; failed: number }> {
  const { supabase } = await requireHrManager();
  const monthStart = firstOfMonth(monthStartInput ?? vnToday());
  const { data: records } = await supabase.from("payroll_records").select("*").eq("month", monthStart);

  let sent = 0;
  let failed = 0;
  for (const record of records ?? []) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, display_name")
        .eq("id", record.profile_id)
        .maybeSingle();
      if (!profile?.email) throw new Error("no email");

      await sendPayslipEmail({
        to: profile.email,
        displayName: profile.display_name,
        month: record.month,
        workDays: record.work_days,
        baseSalary: record.base_salary,
        items: record.items as PayrollItem[],
        status: record.status as "draft" | "paid",
        note: record.note,
      });
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}

export async function getStaffSalary(profileId: string): Promise<StaffSalary | null> {
  const { supabase } = await requireHrManager();
  const { data } = await supabase.from("staff_salary").select("*").eq("profile_id", profileId).maybeSingle();
  return (data as StaffSalary) ?? null;
}

export async function upsertStaffSalary(
  profileId: string,
  monthlySalary: number,
  standardWorkDays: number,
): Promise<StaffSalary> {
  const { supabase } = await requireHrManager();
  const { data, error } = await supabase
    .from("staff_salary")
    .upsert(
      { profile_id: profileId, monthly_salary: monthlySalary, standard_work_days: standardWorkDays },
      { onConflict: "profile_id" },
    )
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể lưu lương cố định");
  return data as StaffSalary;
}

// Director/PM view of every feedback message left on one payslip — shown
// in the payroll edit modal so a flagged mistake doesn't go unnoticed.
export async function listPayrollFeedback(payrollRecordId: string): Promise<PayrollFeedback[]> {
  const { supabase } = await requireHrManager();
  const { data } = await supabase
    .from("payroll_feedback")
    .select("*")
    .eq("payroll_record_id", payrollRecordId)
    .order("created_at", { ascending: true });
  return (data ?? []) as PayrollFeedback[];
}

// The caller's own payslip for the month — this is what backs the
// collapsible "Bảng lương của tôi" panel on the workspace Chấm công page.
// RLS's own "staff can read own payroll" policy is the real gate; the
// .eq("profile_id", user.id) here just narrows the query to match it.
export async function getMyPayroll(monthStartInput?: string): Promise<PayrollRecord | null> {
  const { supabase, user } = await requireUser();
  const monthStart = firstOfMonth(monthStartInput ?? vnToday());
  const { data } = await supabase
    .from("payroll_records")
    .select("*")
    .eq("profile_id", user.id)
    .eq("month", monthStart)
    .maybeSingle();
  return (data as PayrollRecord) ?? null;
}

export async function listMyPayrollFeedback(payrollRecordId: string): Promise<PayrollFeedback[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("payroll_feedback")
    .select("*")
    .eq("payroll_record_id", payrollRecordId)
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });
  return (data ?? []) as PayrollFeedback[];
}

export async function addMyPayrollFeedback(payrollRecordId: string, message: string): Promise<PayrollFeedback> {
  const { supabase, user } = await requireUser();
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Cần nhập nội dung phản hồi.");

  const { data, error } = await supabase
    .from("payroll_feedback")
    .insert({ payroll_record_id: payrollRecordId, profile_id: user.id, message: trimmed })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể gửi phản hồi.");

  // Scheduled with after() rather than fired-and-forgotten inline — on
  // Vercel's serverless runtime, a plain un-awaited promise can get cut off
  // the moment the response is sent (see the identical note in
  // sendDirectMessage in lib/actions/messages.ts).
  after(async () => {
    const [{ data: sender }, { data: directors }] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      supabase.from("profiles").select("id").eq("access_role", "director"),
    ]);
    await Promise.all(
      (directors ?? []).map((d) =>
        sendPushToUser(d.id, {
          title: `${sender?.display_name ?? "Nhân viên"} phản hồi bảng lương`,
          body: trimmed,
          senderId: user.id,
          url: "/quan-tri/bang-luong",
          tag: `funti-payroll-feedback-${payrollRecordId}`,
        }).catch(() => {}),
      ),
    );
  });

  return data as PayrollFeedback;
}

// Director/PM Duyệt/Từ chối on one feedback message — the message and
// author stay exactly as the employee wrote them, only status changes.
export async function updatePayrollFeedbackStatus(feedbackId: string, status: PayrollFeedbackStatus): Promise<PayrollFeedback> {
  const { supabase } = await requireHrManager();
  const { data, error } = await supabase
    .from("payroll_feedback")
    .update({ status })
    .eq("id", feedbackId)
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể cập nhật phản hồi.");
  return data as PayrollFeedback;
}

// Board-level view of which of this month's records have an unresolved
// (pending) feedback message — drives the red dot on each staff card.
export async function listPendingPayrollFeedback(payrollRecordIds: string[]): Promise<PayrollFeedback[]> {
  const { supabase } = await requireHrManager();
  if (payrollRecordIds.length === 0) return [];
  const { data } = await supabase
    .from("payroll_feedback")
    .select("*")
    .in("payroll_record_id", payrollRecordIds)
    .eq("status", "pending");
  return (data ?? []) as PayrollFeedback[];
}

// Sidebar-level ids across every month — drives the red dot on the
// "Bảng lương" nav item itself, so a pending complaint is visible even
// before the director opens the board. Returns ids (not just a count) so
// the client can track them in a Set and stay exactly in sync via realtime
// INSERT/UPDATE/DELETE events instead of drifting from ambiguous deltas.
export async function listPendingPayrollFeedbackIds(): Promise<string[]> {
  const { supabase } = await requireHrManager();
  const { data } = await supabase.from("payroll_feedback").select("id").eq("status", "pending");
  return (data ?? []).map((r) => r.id as string);
}

// The caller's own fixed-salary settings — backs "Lương cứng" / "mỗi ngày
// công" on the payslip panel, alongside the already-computed base_salary.
export async function getMyStaffSalary(): Promise<StaffSalary | null> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("staff_salary").select("*").eq("profile_id", user.id).maybeSingle();
  return (data as StaffSalary) ?? null;
}

// The caller's own bank account on file — lets someone double-check the
// director has the right one saved, right on their own payslip panel.
// RLS's own "staff can read own bank info" policy is the real gate here.
export async function getMyBankInfo(): Promise<StaffBankInfo | null> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("staff_bank_info").select("*").eq("profile_id", user.id).maybeSingle();
  return (data as StaffBankInfo) ?? null;
}

export async function getMyPayrollConfirmation(payrollRecordId: string): Promise<PayrollConfirmation | null> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("payroll_confirmations")
    .select("*")
    .eq("payroll_record_id", payrollRecordId)
    .eq("profile_id", user.id)
    .maybeSingle();
  return (data as PayrollConfirmation) ?? null;
}

export async function confirmMyPayroll(payrollRecordId: string): Promise<PayrollConfirmation> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("payroll_confirmations")
    .upsert({ payroll_record_id: payrollRecordId, profile_id: user.id }, { onConflict: "payroll_record_id" })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể xác nhận.");
  return data as PayrollConfirmation;
}

// Director/PM board view — which of this month's already-loaded records
// have a confirmation, keyed by payroll_record_id for an O(1) lookup while
// rendering the staff grid.
export async function listPayrollConfirmations(payrollRecordIds: string[]): Promise<PayrollConfirmation[]> {
  const { supabase } = await requireHrManager();
  if (payrollRecordIds.length === 0) return [];
  const { data } = await supabase.from("payroll_confirmations").select("*").in("payroll_record_id", payrollRecordIds);
  return (data ?? []) as PayrollConfirmation[];
}
