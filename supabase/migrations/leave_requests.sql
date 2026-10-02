-- Đơn xin nghỉ: a staff member picks a day (or a run of days) from today
-- on their own Chấm công calendar; a Giám đốc or PM approves it, which marks
-- those work days on the attendance board ("Nghỉ phép" / "Nghỉ có lương" /
-- "Nửa công") and recomputes payroll. Run once in the Supabase Dashboard
-- SQL Editor.
--
-- The reason is private: each person sees only their own requests;
-- Giám đốc and PM (can_manage_hr()) see all of them. The attendance rows an
-- approval writes never carry the reason (everyone can read attendance).

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  -- Half a day (a single day only): approved as "Nửa công".
  half_day boolean not null default false,
  reason text check (char_length(reason) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  -- Decided on approval: true = "Nghỉ có lương", false = "Nghỉ phép" (unpaid).
  paid boolean,
  decision_note text check (char_length(decision_note) <= 300),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  requested_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 30),
  check (not half_day or start_date = end_date)
);

create index if not exists leave_requests_profile_idx on public.leave_requests (profile_id, start_date desc);
create index if not exists leave_requests_pending_idx on public.leave_requests (status) where status = 'pending';

alter table public.leave_requests enable row level security;

drop policy if exists "own or hr can read leave requests" on public.leave_requests;
create policy "own or hr can read leave requests"
  on public.leave_requests for select
  to authenticated
  using (profile_id = auth.uid() or public.can_manage_hr());

-- Staff ask for themselves only, from today on, always as a fresh request.
drop policy if exists "staff can request own leave" on public.leave_requests;
create policy "staff can request own leave"
  on public.leave_requests for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and paid is null
    and decided_by is null
    and decided_at is null
    and start_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date
  );

-- …and can withdraw one still waiting.
drop policy if exists "staff can cancel own pending leave" on public.leave_requests;
create policy "staff can cancel own pending leave"
  on public.leave_requests for update
  to authenticated
  using (profile_id = auth.uid() and status = 'pending')
  with check (profile_id = auth.uid() and status = 'cancelled' and paid is null and decided_by is null);

-- Giám đốc / PM decide (the app then writes the attendance days).
drop policy if exists "hr can decide leave" on public.leave_requests;
create policy "hr can decide leave"
  on public.leave_requests for update
  to authenticated
  using (public.can_manage_hr())
  with check (public.can_manage_hr());

-- Live updates on both Chấm công pages and the Quản trị menu's red dot.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_requests'
  ) then
    alter publication supabase_realtime add table public.leave_requests;
  end if;
end $$;
