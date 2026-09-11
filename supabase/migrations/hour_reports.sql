-- End-of-day time logs staff on hourly-rate projects post in the "Chung"
-- room chat every day. Turns that free-text chat habit into something a PM
-- can filter/tally — the Server Action that inserts a row here also posts
-- the same content as a normal chat message, so nothing changes about how
-- staff read the "Chung" feed day to day. Run once in the Supabase
-- Dashboard SQL Editor.

create table if not exists public.hour_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  project_channel_id uuid references public.meeting_channels (id) on delete set null,
  message_id uuid references public.meeting_messages (id) on delete set null,
  work_date date not null,
  hours numeric(4,1) not null check (hours > 0 and hours <= 24),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists hour_reports_profile_date_idx
  on public.hour_reports (profile_id, work_date);
create index if not exists hour_reports_project_channel_idx
  on public.hour_reports (project_channel_id);

alter table public.hour_reports enable row level security;

drop policy if exists "staff can log their own hour reports" on public.hour_reports;
create policy "staff can log their own hour reports"
  on public.hour_reports for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "staff can read their own hour reports" on public.hour_reports;
create policy "staff can read their own hour reports"
  on public.hour_reports for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "hr can manage hour reports" on public.hour_reports;
create policy "hr can manage hour reports"
  on public.hour_reports for all
  to authenticated
  using (public.can_manage_hr())
  with check (public.can_manage_hr());
