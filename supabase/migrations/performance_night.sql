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
    -- The pair's own channel too (section 3): the open conversation on both
    -- sides listens there. Lower id first, compared as plain bytes — the
    -- same order the browser uses to build the topic name.
    perform realtime.send(
      to_jsonb(new),
      'dm',
      'dm:' || least(new.sender_id::text collate "C", new.recipient_id::text collate "C")
        || ':' || greatest(new.sender_id::text collate "C", new.recipient_id::text collate "C"),
      true
    );
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

-- 3) Private DM channel per pair ---------------------------------------------
-- dm:<id A>:<id B> (the two profile ids, lower one first) — only those two
-- people may listen or send. While a conversation is open both sides are
-- joined to it, so a message goes out over the already-open socket
-- (~0.06–0.08s) instead of a REST call into the other person's inbox
-- (~0.13–0.16s). inbox:<id> stays for unread badges / dings elsewhere.
-- Same functions as supabase/migrations/chat_private_broadcast.sql, with the
-- dm: branch added — room: and inbox: rules are unchanged.

create or replace function public.chat_topic_can_receive(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic like 'room:%' then
      exists (
        select 1 from public.meeting_channels c
        where c.id::text = substr(p_topic, 6) and (c.is_general or c.is_food_room)
      )
      or exists (
        select 1 from public.meeting_channel_members m
        where m.channel_id::text = substr(p_topic, 6) and m.profile_id = auth.uid()
      )
      or public.current_access_role() = 'director'
    when p_topic like 'inbox:%' then substr(p_topic, 7) = auth.uid()::text
    when p_topic ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
      auth.uid()::text in (substr(p_topic, 4, 36), substr(p_topic, 41, 36))
    else false
  end;
$$;

create or replace function public.chat_topic_can_send(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic like 'room:%' then
      exists (
        select 1 from public.meeting_channels c
        where c.id::text = substr(p_topic, 6) and (c.is_general or c.is_food_room)
      )
      or exists (
        select 1 from public.meeting_channel_members m
        where m.channel_id::text = substr(p_topic, 6) and m.profile_id = auth.uid()
      )
    when p_topic like 'inbox:%' then
      exists (select 1 from public.profiles p where p.id = auth.uid())
    when p_topic ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
      auth.uid()::text in (substr(p_topic, 4, 36), substr(p_topic, 41, 36))
    else false
  end;
$$;
