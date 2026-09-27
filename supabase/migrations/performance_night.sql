-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.
--
-- 1) client_errors — uncaught errors from staff screens, sent by
--    ClientErrorReporter via /api/client-error (service role inserts only).
--    Director/PM can read them. Anything older than 30 days is cleared
--    nightly.
-- 2) Broadcast from the database — the moment a chat message row is saved,
--    Postgres itself pushes it to the same private Realtime topics the
--    browsers already listen on (room:<channel id> / inbox:<recipient id>).
--    Until now that relied on the sender's own browser broadcasting (fast,
--    but lost if the sender's tab closes mid-send) plus the slower
--    postgres_changes feed (~0.6s). Browsers already de-duplicate by row id,
--    and a saved row replaces a provisional copy, so no app change is
--    needed. A failure inside these triggers never blocks saving a message.

-- 1) client_errors -----------------------------------------------------------
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  message text not null,
  stack text,
  page_url text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

drop policy if exists "director or pm can read client errors" on public.client_errors;
create policy "director or pm can read client errors" on public.client_errors
  for select to authenticated using (public.is_director_or_pm());

-- 16:30 UTC = 23:30 VN, after the 23:00 payroll job.
select cron.schedule(
  'client-errors-cleanup',
  '30 16 * * *',
  $$delete from public.client_errors where created_at < now() - interval '30 days'$$
);

-- 2) Broadcast from the database --------------------------------------------
create or replace function public.broadcast_new_meeting_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.send(to_jsonb(new), 'message', 'room:' || new.channel_id::text, true);
  exception when others then
    null; -- never block saving the message
  end;
  return null;
end;
$$;

drop trigger if exists meeting_messages_broadcast on public.meeting_messages;
create trigger meeting_messages_broadcast
  after insert on public.meeting_messages
  for each row execute function public.broadcast_new_meeting_message();

create or replace function public.broadcast_new_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.send(to_jsonb(new), 'dm', 'inbox:' || new.recipient_id::text, true);
  exception when others then
    null; -- never block saving the message
  end;
  return null;
end;
$$;

drop trigger if exists direct_messages_broadcast on public.direct_messages;
create trigger direct_messages_broadcast
  after insert on public.direct_messages
  for each row execute function public.broadcast_new_direct_message();

-- (No revoke needed: trigger functions can't be called directly — Postgres
-- only runs them as triggers, and the API never exposes them.)
