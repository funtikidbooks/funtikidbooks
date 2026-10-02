import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firstOfMonth, lastDayOfMonth, summarizeAttendance } from "@/lib/constants/attendance";
import type { AttendanceEntry } from "@/lib/types";

// Keeps an already-saved payroll_records row in sync with attendance —
// director/PM only touch attendance here, and if this employee already has
// a payslip for that month, its base pay (rate × ngày công) and work_days
// get recomputed against the fresh attendance count immediately, live on
// the payroll board, rather than staying frozen at whatever was true the
// last time someone opened and saved the payroll modal. A director's own
// manual "Số ngày đi làm" override in that modal still wins until the next
// attendance edit — this only recomputes the number payroll actually uses.
// No-ops silently if no payroll row or no rate is set yet — nothing to
// keep in sync in that case. Also no-ops if that payslip has a
// fixed_amount ("lương cứng tháng này") set — the whole point of that
// override is paying a flat amount regardless of attendance, so this must
// never overwrite it just because a cell got edited.
export async function syncPayrollForAttendanceChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  workDate: string,
) {
  const month = firstOfMonth(workDate);

  // One payroll formula, not two: the same SQL function the 23:00 job runs
  // (supabase/migrations/payroll_daily_sync.sql) recomputes the month right
  // away, called with the service role. If that call fails for any reason,
  // fall through to the equivalent calculation below.
  try {
    const { error } = await createAdminClient().rpc("sync_payroll_month", { target_month: month });
    if (!error) return;
  } catch {
    // fall through
  }

  const { data: record } = await supabase
    .from("payroll_records")
    .select("id, fixed_amount")
    .eq("profile_id", profileId)
    .eq("month", month)
    .maybeSingle();
  if (!record || record.fixed_amount !== null) return;

  const [{ data: salary }, { data: entries }] = await Promise.all([
    supabase.from("staff_salary").select("monthly_salary, standard_work_days").eq("profile_id", profileId).maybeSingle(),
    supabase
      .from("attendance")
      .select("work_date, status, check_in_at")
      .eq("profile_id", profileId)
      .gte("work_date", month)
      .lte("work_date", lastDayOfMonth(month)),
  ]);
  if (!salary || !salary.standard_work_days) return;

  const stats = summarizeAttendance((entries ?? []) as { work_date: string; status: AttendanceEntry["status"]; check_in_at: string | null }[]);
  const dailyRate = Math.round(salary.monthly_salary / salary.standard_work_days);
  const newBase = dailyRate * stats.present;

  await supabase.from("payroll_records").update({ base_salary: newBase, work_days: stats.present }).eq("id", record.id);
  // Same rule as a director's own edit in the payroll modal — the employee
  // confirmed different numbers, so that confirmation no longer applies.
  await supabase.from("payroll_confirmations").delete().eq("payroll_record_id", record.id);
}
