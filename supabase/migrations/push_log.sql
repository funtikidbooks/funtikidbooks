-- One row per notification per device: when the server sent it, whether
-- Apple/Google accepted it, and when the device reported showing it
-- (sw.js → /api/push/ack). Until now only each device's *latest*
-- delivery was kept, so "Lalune bị miss tin nhắn hoài" couldn't be traced
-- to which message, which device, or which hour. Quản trị → Thông báo trên
-- máy reads it. Kept 14 days.
-- Run once in the Supabase Dashboard SQL Editor.

create table if not exists public.push_log (
  id bigserial primary key,
  subscription_id uuid,
  profile_id uuid,
  device text,
  message_id text,
  title text,
  sent_at timestamptz not null,
  ok boolean not null,
  status integer,
  delivered_at timestamptz,
  delivery_ms integer
);
create index if not exists push_log_sub_sent on public.push_log (subscription_id, sent_at);
create index if not exists push_log_profile_sent on public.push_log (profile_id, sent_at desc);

-- Server only (service role); no policies.
alter table public.push_log enable row level security;

select cron.schedule(
  'push-log-cleanup',
  '40 17 * * *',
  $$delete from public.push_log where sent_at < now() - interval '14 days'$$
);
