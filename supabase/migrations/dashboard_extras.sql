-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.
--
-- Two small additions for Quản trị → Tổng quan.

-- 1) Tiền thu của từng dự án — for "Lời/lỗ theo dự án" (thu − giờ làm ×
--    lương theo giờ). Its own director-only table on purpose: every staff
--    member can read meeting_channels, and what a client pays must not leak
--    through it.
create table if not exists public.project_finance (
  channel_id uuid primary key references public.meeting_channels (id) on delete cascade,
  revenue_vnd bigint not null default 0 check (revenue_vnd >= 0),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.project_finance enable row level security;

drop policy if exists "project_finance director only" on public.project_finance;
create policy "project_finance director only"
  on public.project_finance for all
  to authenticated
  using (public.current_access_role() = 'director')
  with check (public.current_access_role() = 'director');

-- 2) Upwork leads can now go past "Đã gửi": "Khách trả lời" and "Đã chốt",
--    so the dashboard's funnel shows how many proposals turn into work.
alter table public.upwork_leads drop constraint if exists upwork_leads_status_check;
alter table public.upwork_leads
  add constraint upwork_leads_status_check
  check (status in ('pending', 'approved', 'rejected', 'sent', 'replied', 'hired'));
