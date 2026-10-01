-- Ứng tiền trước: a staff member asks for part of their pay early from
-- their own Chấm công page; only a Giám đốc approves (a PM can see the list
-- but not decide); an approved advance goes on that month's payslip as an
-- "Ứng lương dd/mm" deduction. Run once in the Supabase Dashboard SQL Editor.
--
-- Private by design: each person sees only their own requests — never a
-- colleague's. Giám đốc and PM (can_manage_hr()) see all of them.

-- 1. The requests.
create table if not exists public.salary_advances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- What the staff member asked for; minimum 1.000.000 ₫.
  amount numeric not null check (amount >= 1000000 and amount <= 1000000000),
  reason text check (char_length(reason) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  -- What the Giám đốc approved — the asked amount unless they changed it.
  approved_amount numeric check (approved_amount is null or approved_amount > 0),
  -- The payslip month (1st of the month) it comes off.
  deduct_month date,
  decision_note text check (char_length(decision_note) <= 300),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  -- The payslip its "Ứng lương" line went on; empty until that month's
  -- payslip exists (sync_payroll_month below adds it then).
  payroll_record_id uuid references public.payroll_records (id) on delete set null,
  requested_at timestamptz not null default now()
);

create index if not exists salary_advances_profile_idx on public.salary_advances (profile_id, requested_at desc);
create index if not exists salary_advances_waiting_idx on public.salary_advances (deduct_month)
  where status = 'approved' and payroll_record_id is null;

alter table public.salary_advances enable row level security;

drop policy if exists "own or hr can read advances" on public.salary_advances;
create policy "own or hr can read advances"
  on public.salary_advances for select
  to authenticated
  using (profile_id = auth.uid() or public.can_manage_hr());

-- Staff ask for themselves only, always as a fresh waiting request.
drop policy if exists "staff can request own advance" on public.salary_advances;
create policy "staff can request own advance"
  on public.salary_advances for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and approved_amount is null
    and deduct_month is null
    and decided_by is null
    and decided_at is null
    and payroll_record_id is null
  );

-- …and can withdraw it while it's still waiting. Every other change goes
-- through decide_salary_advance() below.
drop policy if exists "staff can cancel own pending advance" on public.salary_advances;
create policy "staff can cancel own pending advance"
  on public.salary_advances for update
  to authenticated
  using (profile_id = auth.uid() and status = 'pending')
  with check (
    profile_id = auth.uid()
    and status = 'cancelled'
    and approved_amount is null
    and decided_by is null
    and payroll_record_id is null
  );

-- Live updates on the Chấm công pages (realtime respects the policies above).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'salary_advances'
  ) then
    alter publication supabase_realtime add table public.salary_advances;
  end if;
end $$;

-- 2. A Giám đốc's Duyệt / Từ chối. Approving puts the "Ứng lương" line on
--    that month's payslip straight away when it exists and isn't paid yet
--    (and clears the employee's "đã kiểm tra, đúng" confirmation, since the
--    numbers changed — same rule as any other payslip edit).
create or replace function public.decide_salary_advance(
  p_id uuid,
  p_approve boolean,
  p_amount numeric default null,
  p_month date default null,
  p_note text default null
)
returns public.salary_advances
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.salary_advances;
  rec public.payroll_records;
  has_rec boolean;
  m date := date_trunc('month', p_month)::date;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and access_role = 'director') then
    raise exception 'Chỉ Giám đốc duyệt được yêu cầu ứng tiền.';
  end if;

  select * into a from public.salary_advances where id = p_id for update;
  if not found then
    raise exception 'Không tìm thấy yêu cầu này.';
  end if;
  if a.status <> 'pending' then
    raise exception 'Yêu cầu này đã được xử lý rồi.';
  end if;
  -- A Giám đốc may decide their own request too (sếp Phúc, 1/10/2026).

  if not p_approve then
    update public.salary_advances
    set status = 'rejected', decision_note = note, decided_by = auth.uid(), decided_at = now()
    where id = p_id
    returning * into a;
    return a;
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then
    raise exception 'Số tiền duyệt không hợp lệ.';
  end if;
  if m is null then
    raise exception 'Chọn tháng trừ lương.';
  end if;

  select * into rec from public.payroll_records where profile_id = a.profile_id and month = m for update;
  has_rec := found;
  if has_rec and rec.status = 'paid' then
    raise exception 'Bảng lương tháng này đã trả rồi, chọn tháng sau nhé.';
  end if;

  update public.salary_advances
  set status = 'approved', approved_amount = p_amount, deduct_month = m, decision_note = note,
      decided_by = auth.uid(), decided_at = now()
  where id = p_id
  returning * into a;

  if has_rec then
    update public.payroll_records
    set items = items || jsonb_build_array(jsonb_build_object(
      'label', 'Ứng lương ' || to_char(a.decided_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM'),
      'amount', -p_amount))
    where id = rec.id;
    delete from public.payroll_confirmations where payroll_record_id = rec.id;
    update public.salary_advances set payroll_record_id = rec.id where id = p_id returning * into a;
  end if;

  return a;
end;
$$;

revoke all on function public.decide_salary_advance(uuid, boolean, numeric, date, text) from public, anon;
grant execute on function public.decide_salary_advance(uuid, boolean, numeric, date, text) to authenticated;

-- 3. The nightly payroll sync (payroll_recurring_items.sql) — unchanged,
--    plus one step at the end: an advance approved for a month whose
--    payslip didn't exist yet gets its "Ứng lương" line once it does.
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
  adv record;
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

  for adv in
    select sa.id, sa.approved_amount, sa.decided_at, p.id as record_id
    from public.salary_advances sa
    join public.payroll_records p on p.profile_id = sa.profile_id and p.month = m and p.status = 'draft'
    where sa.status = 'approved' and sa.deduct_month = m and sa.payroll_record_id is null
  loop
    update public.payroll_records
    set items = items || jsonb_build_array(jsonb_build_object(
      'label', 'Ứng lương ' || to_char(adv.decided_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM'),
      'amount', -adv.approved_amount))
    where id = adv.record_id;
    delete from public.payroll_confirmations where payroll_record_id = adv.record_id;
    update public.salary_advances set payroll_record_id = adv.record_id where id = adv.id;
  end loop;

  created_count := c;
  updated_count := u;
  return next;
end;
$$;

revoke all on function public.sync_payroll_month(date) from public, anon, authenticated;
