-- Which device each person opens the workspace on, and whether that device
-- can get message notifications ("granted", or why not: "needs-ios-install",
-- "denied", "default", "failed", "unsupported"). Written on every workspace
-- open (lib/actions/push.ts → reportPushState); Quản trị → Thông báo trên
-- máy shows the devices that can't. Before this, a device that never signed
-- up left no trace at all — Ánh Dương, Như Ý and Lucia looked "registered"
-- (old subscriptions) while the iPad/computer they actually used got nothing.
-- Run once in the Supabase Dashboard SQL Editor.

create table if not exists public.push_device_state (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device text not null,
  status text not null,
  user_agent text,
  updated_at timestamptz not null default now(),
  primary key (profile_id, device)
);

-- Written and read by the server only (service role); no policies needed.
alter table public.push_device_state enable row level security;
