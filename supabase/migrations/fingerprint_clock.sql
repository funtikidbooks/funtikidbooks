-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.
-- Máy chấm công vân tay: an ESP32 + fingerprint sensor at the office
-- (hardware/may-cham-cong/). The sensor keeps the fingerprints itself, each
-- in a numbered slot; this maps a slot to a person, queues "enrol this
-- person in slot N" / "delete slot N" for the machine to pick up, and logs
-- every scan. The machine talks only to /api/clock/* with its own secret
-- (service role behind it); people manage it from Quản trị → Chấm công.

-- Giờ về, and where a day's check-in came from: 'web' (opening the
-- workspace) or 'device' (a finger on the machine — it wins over 'web').
alter table public.attendance add column if not exists check_out_at timestamptz;
alter table public.attendance add column if not exists check_in_source text not null default 'web';

create table if not exists public.clock_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Máy chấm công',
  -- sha256 of the machine's secret; the secret itself is shown once.
  token_hash text not null unique,
  capacity integer not null default 200,
  last_seen_at timestamptz,
  firmware text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.clock_fingers (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.clock_devices (id) on delete cascade,
  slot integer not null check (slot between 1 and 1000),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (device_id, slot)
);

create table if not exists public.clock_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.clock_devices (id) on delete cascade,
  kind text not null check (kind in ('enroll', 'delete')),
  slot integer not null,
  profile_id uuid references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
  -- The machine's current step while enrolling (place1, lift, place2…) or why it failed.
  step text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clock_commands_device_status_idx on public.clock_commands (device_id, status, created_at);

create table if not exists public.clock_scans (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.clock_devices (id) on delete set null,
  slot integer,
  profile_id uuid references public.profiles (id) on delete set null,
  scanned_at timestamptz not null,
  received_at timestamptz not null default now(),
  result text not null default ''
);
create index if not exists clock_scans_scanned_at_idx on public.clock_scans (scanned_at desc);

alter table public.clock_devices enable row level security;
alter table public.clock_fingers enable row level security;
alter table public.clock_commands enable row level security;
alter table public.clock_scans enable row level security;

-- Director and the Project Manager (the people who run Chấm công).
drop policy if exists "hr manages clock devices" on public.clock_devices;
create policy "hr manages clock devices" on public.clock_devices
  for all to authenticated using (public.can_manage_hr()) with check (public.can_manage_hr());
drop policy if exists "hr manages clock fingers" on public.clock_fingers;
create policy "hr manages clock fingers" on public.clock_fingers
  for all to authenticated using (public.can_manage_hr()) with check (public.can_manage_hr());
drop policy if exists "hr manages clock commands" on public.clock_commands;
create policy "hr manages clock commands" on public.clock_commands
  for all to authenticated using (public.can_manage_hr()) with check (public.can_manage_hr());
drop policy if exists "hr reads clock scans" on public.clock_scans;
create policy "hr reads clock scans" on public.clock_scans
  for select to authenticated using (public.can_manage_hr());
