-- Run once in the Supabase Dashboard SQL Editor.
-- Recomputes this month's draft payslips from attendance every night at
-- 23:00 VN time (16:00 UTC), so Bảng lương keeps up with ordinary daily
-- check-ins, not only with a director/PM's manual attendance edit (see
-- syncPayrollForAttendanceChange in src/lib/actions/attendance.ts).
--
-- Same math as the app: ngày công = summarizeAttendance()'s `present` in
-- src/lib/constants/attendance.ts (paid_leave = 1, half_day = 0.5, present
-- with a check-in = 1), lương cơ bản = round(monthly_salary /
-- standard_work_days) × ngày công. Keep the two in step if either changes.
--
-- Never touches a payslip marked "Đã trả" or one with a flat "lương cứng
-- tháng này" (fixed_amount). Creates a draft payslip for anyone with a
-- salary set up who doesn't have one yet this month. When a payslip's
-- numbers change, the employee's earlier "đã kiểm tra, đúng" confirmation
-- is cleared — same rule as a director's own edit.

create extension if not exists pg_cron;

create or replace function public.sync_payroll_month(target_month date default null)
returns table (created_count int, updated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', coalesce(target_month, (now() at time zone 'Asia/Ho_Chi_Minh')::date))::date;
  m_end date := (date_trunc('month', coalesce(target_month, (now() at time zone 'Asia/Ho_Chi_Minh')::date)) + interval '1 month - 1 day')::date;
  c int := 0;
  u int := 0;
  r record;
  new_base numeric;
begin
  for r in
    with days as (
      select a.profile_id,
             sum(case
                   when a.status = 'paid_leave' then 1
                   when a.status = 'half_day' then 0.5
                   when a.status = 'present' and a.check_in_at is not null then 1
                   else 0
                 end) as present
      from public.attendance a
      where a.work_date between m and m_end
      group by a.profile_id
    )
    select s.profile_id,
           coalesce(d.present, 0) as present,
           round(s.monthly_salary / s.standard_work_days) as daily_rate,
           p.id as record_id,
           p.status,
           p.fixed_amount,
           p.base_salary,
           p.work_days
    from public.staff_salary s
    left join days d on d.profile_id = s.profile_id
    left join public.payroll_records p on p.profile_id = s.profile_id and p.month = m
    where s.monthly_salary > 0 and s.standard_work_days > 0
  loop
    new_base := r.daily_rate * r.present;
    if r.record_id is null then
      insert into public.payroll_records (profile_id, month, base_salary, work_days, status)
      values (r.profile_id, m, new_base, r.present, 'draft')
      on conflict (profile_id, month) do nothing;
      c := c + 1;
    elsif r.status = 'draft'
      and r.fixed_amount is null
      and (r.base_salary is distinct from new_base or r.work_days is distinct from r.present) then
      update public.payroll_records set base_salary = new_base, work_days = r.present where id = r.record_id;
      delete from public.payroll_confirmations where payroll_record_id = r.record_id;
      u := u + 1;
    end if;
  end loop;
  created_count := c;
  updated_count := u;
  return next;
end;
$$;

-- Only the scheduler (runs as the database owner) calls this — never the
-- website's anon/logged-in roles.
revoke all on function public.sync_payroll_month(date) from public, anon, authenticated;

-- 23:00 Asia/Ho_Chi_Minh every day. Re-running this file just replaces the
-- job with the same name.
select cron.schedule('payroll-daily-sync', '0 16 * * *', $$select public.sync_payroll_month()$$);

-- Bring this month up to date right now instead of waiting for tonight.
select * from public.sync_payroll_month();
