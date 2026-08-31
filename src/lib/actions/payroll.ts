"use server";

import { createClient } from "@/lib/supabase/server";
import { firstOfMonth, vnToday } from "@/lib/constants/attendance";
import type { PayrollConfirmation, PayrollFeedback, PayrollItem, PayrollRecord, PayrollStatus, StaffSalary } from "@/lib/types";

// Director, or any staff whose chức danh is exactly "Project Manager" —
// mirrors the can_manage_hr() RLS helper in supabase/schema.sql.
async function requireHrManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");

  const { data: profile } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    throw new Error("Bạn không có quyền này.");
  }
  return { supabase, user };
}

// Any logged-in staff member, reading only their own data — RLS on
// payroll_records/payroll_feedback (profile_id = auth.uid()) is the real
// enforcement here, this just gets a client + the caller's id.
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
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
  return data as PayrollFeedback;
}

// The caller's own fixed-salary settings — backs "Lương cứng" / "mỗi ngày
// công" on the payslip panel, alongside the already-computed base_salary.
export async function getMyStaffSalary(): Promise<StaffSalary | null> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("staff_salary").select("*").eq("profile_id", user.id).maybeSingle();
  return (data as StaffSalary) ?? null;
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
