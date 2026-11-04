-- Lương chỉ hiện khi phiếu lương được gửi (4/11/2026). sếp Phúc: staff
-- must not see what a day of work pays or the month's running total — only
-- the payslip he hands out at the end of the month. Until now the nightly
-- job (sync_payroll_month) kept this month's draft payslip up to date and
-- every employee could read it, and their own salary row, at any time.
--
-- 1) payroll_records.released_at: set when the payslip is emailed to the
--    employee (Quản trị → Bảng lương → Gửi email, one or everyone — see
--    markReleased in src/lib/actions/payroll.ts). An employee reads their
--    own payslip only once it's released or marked "Đã trả". Months already
--    over were handed out before this existed, so they count as released.
-- 2) staff_salary is no longer readable by the employee — the per-day rate
--    (lương / ngày công chuẩn) is the very number being kept back. Giám
--    đốc / PM keep full access; "Ứng tiền trước" now asks the server
--    whether someone has a salary instead of reading the row.
--
-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.

alter table public.payroll_records add column if not exists released_at timestamptz;

-- August–October 2026 were already handed out. A fixed date, so running
-- this file again later never releases a month nobody has sent yet.
update public.payroll_records
set released_at = now()
where released_at is null
  and month < date '2026-11-01';

drop policy if exists "staff can read own payroll" on public.payroll_records;
create policy "staff can read own payroll"
  on public.payroll_records for select
  to authenticated
  using (profile_id = auth.uid() and (released_at is not null or status = 'paid'));

drop policy if exists "staff can read own staff salary" on public.staff_salary;
