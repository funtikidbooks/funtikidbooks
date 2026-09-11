-- Shared, company-wide weekly timesheet grid under Workspace → "Báo cáo
-- giờ" — every project's hours, visible to everyone (matches the earlier
-- "Chung" chat reports, which everyone could already read), logged by each
-- staff member for their own contribution only. Replaces an earlier
-- chat-post + admin-review version of this feature. Safe to re-run in the
-- Supabase Dashboard SQL Editor regardless of which earlier version you
-- already ran.

create table if not exists public.hour_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  project_channel_id uuid references public.meeting_channels (id) on delete set null,
  work_date date not null,
  hours numeric(4,1) not null check (hours > 0 and hours <= 24),
  note text,
  created_at timestamptz not null default now()
);

-- Columns from the earlier post-to-chat + admin-review version that the
-- timesheet grid doesn't use anymore.
alter table public.hour_reports drop column if exists message_id;
alter table public.hour_reports drop column if exists reviewed_at;
alter table public.hour_reports drop column if exists reviewed_by;

-- One row per (person, project, day) — logHours() upserts against this so
-- re-entering a day updates it in place instead of piling up duplicates.
create unique index if not exists hour_reports_person_project_day_idx
  on public.hour_reports (profile_id, project_channel_id, work_date);

create index if not exists hour_reports_project_date_idx
  on public.hour_reports (project_channel_id, work_date);

alter table public.hour_reports enable row level security;

drop policy if exists "staff can log their own hour reports" on public.hour_reports;
create policy "staff can log their own hour reports"
  on public.hour_reports for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Open read — a shared team timesheet, not a private log.
drop policy if exists "staff can read their own hour reports" on public.hour_reports;
drop policy if exists "everyone can read hour reports" on public.hour_reports;
create policy "everyone can read hour reports"
  on public.hour_reports for select
  to authenticated
  using (true);

drop policy if exists "hr can manage hour reports" on public.hour_reports;
create policy "hr can manage hour reports"
  on public.hour_reports for all
  to authenticated
  using (public.can_manage_hr())
  with check (public.can_manage_hr());

-- Weekly hour budget per project room — shown as a filling progress bar on
-- the timesheet, summed across every staff member logging hours to that
-- project that week. Director/PM-only to edit (can_manage_hr()).
alter table public.meeting_channels add column if not exists weekly_hour_cap numeric(5,1);
