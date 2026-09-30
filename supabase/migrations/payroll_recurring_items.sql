-- Khoản cố định hằng tháng: per-staff allowances (or deductions) that go on
-- every month's payslip — "Trợ cấp bảo hiểm 1.000.000", "Lương dọn dẹp
-- 500.000" — set once in the payroll modal instead of retyped each month.
-- Run once in the Supabase Dashboard SQL Editor.

-- 1. Where they live: one list per person, beside their monthly salary.
alter table public.staff_salary
  add column if not exists recurring_items jsonb not null default '[]'::jsonb;

-- 2. The nightly payroll sync (payroll_daily_sync.sql) now starts each new
--    month's draft payslip with that person's fixed items. Everything else
--    is unchanged: never touches "Đã trả" or "lương cứng tháng này", only
--    recomputes base pay from attendance.
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
           coalesce(s.recurring_items, '[]'::jsonb) as recurring_items,
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
      insert into public.payroll_records (profile_id, month, base_salary, work_days, items, status)
      values (r.profile_id, m, new_base, r.present, r.recurring_items, 'draft')
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

revoke all on function public.sync_payroll_month(date) from public, anon, authenticated;

-- 3. Start everyone's fixed list from what September's payslip already has
--    (the allowances added on 30/9) — only for people whose list is still
--    empty. Change or delete any line later in the payroll modal.
update public.staff_salary s
set recurring_items = p.items
from public.payroll_records p
where p.profile_id = s.profile_id
  and p.month = '2026-09-01'
  and jsonb_array_length(p.items) > 0
  and s.recurring_items = '[]'::jsonb;
