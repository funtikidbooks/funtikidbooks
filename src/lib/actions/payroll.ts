"use server";

import { createClient } from "@/lib/supabase/server";
import { firstOfMonth, vnToday } from "@/lib/constants/attendance";
import type { PayrollItem, PayrollRecord, PayrollStatus, StaffSalary } from "@/lib/types";

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

export async function listPayrollForMonth(monthStartInput?: string): Promise<PayrollRecord[]> {
  const { supabase } = await requireHrManager();
  const monthStart = firstOfMonth(monthStartInput ?? vnToday());
  const { data } = await supabase.from("payroll_records").select("*").eq("month", monthStart);
  return (data ?? []) as PayrollRecord[];
}

export async function upsertPayroll(input: {
  profileId: string;
  month: string;
  baseSalary: number;
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
