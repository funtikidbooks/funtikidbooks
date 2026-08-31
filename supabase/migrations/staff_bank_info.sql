-- Bank account details per staff member, for the "Thành viên" page.
-- Director-only end to end (own table + own RLS, never selected alongside
-- the plain profiles.* fetch every staff member's browser gets on that
-- page). Run once in the Supabase Dashboard SQL Editor.

create table if not exists public.staff_bank_info (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  bank_name text,
  account_number text,
  account_holder text,
  updated_at timestamptz not null default now()
);

alter table public.staff_bank_info enable row level security;

drop policy if exists "director can manage staff bank info" on public.staff_bank_info;
create policy "director can manage staff bank info"
  on public.staff_bank_info for all
  to authenticated
  using (public.current_access_role() = 'director')
  with check (public.current_access_role() = 'director');

drop trigger if exists staff_bank_info_set_updated_at on public.staff_bank_info;
create trigger staff_bank_info_set_updated_at
  before update on public.staff_bank_info
  for each row execute procedure public.set_updated_at();
