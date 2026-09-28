-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.
--
-- Thử việc → nhân viên chính thức. A new staff member is on probation for
-- their first 2 months (from profiles.joined_at, or created_at when that's
-- unset — see src/lib/probation.ts). The director or PM confirms them as
-- official from Quản trị → Nhân sự & phân quyền, which writes a row here
-- and emails the staff member.
--
-- Its own table rather than a column on profiles on purpose: profiles'
-- "a user can update their own profile" policy would let anyone mark
-- themselves official. Everyone signed in can read it (the "Thử việc" tag
-- on Thành viên), only director/PM (can_manage_hr()) can write it.

create table if not exists public.staff_probation (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  official_at date not null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.staff_probation enable row level security;

drop policy if exists "staff_probation readable by signed-in staff" on public.staff_probation;
create policy "staff_probation readable by signed-in staff"
  on public.staff_probation for select
  to authenticated
  using (true);

drop policy if exists "staff_probation managed by director or PM" on public.staff_probation;
create policy "staff_probation managed by director or PM"
  on public.staff_probation for all
  to authenticated
  using (public.can_manage_hr())
  with check (public.can_manage_hr());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_probation'
  ) then
    alter publication supabase_realtime add table public.staff_probation;
  end if;
end $$;
