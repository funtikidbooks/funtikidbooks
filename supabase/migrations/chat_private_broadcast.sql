-- Run once in the Supabase Dashboard SQL Editor.
--
-- Fast path for chat: right after a message is saved, the sender's browser
-- also Broadcasts the saved row over Supabase Realtime, which reaches the
-- other side in ~0.06s versus ~0.6s for the database-change feed (measured
-- from Vietnam, 2026-09-25). The database-change feed stays as the backup.
--
-- Broadcast channels are public by default — anyone holding the (public)
-- anon key could listen in. These use PRIVATE channels instead, and the
-- policies below decide who may listen/send, mirroring meeting_messages'
-- own RLS:
--   room:<meeting_channel id>  — members of that room (+ everyone for Chung
--                                / the food room; director may listen to all)
--   inbox:<profile id>         — only that person may listen; any signed-in
--                                staff member may send (to DM them)

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
    else false
  end;
$$;

drop policy if exists "chat topics: receive" on realtime.messages;
create policy "chat topics: receive"
  on realtime.messages for select
  to authenticated
  using (realtime.messages.extension in ('broadcast') and public.chat_topic_can_receive(realtime.topic()));

drop policy if exists "chat topics: send" on realtime.messages;
create policy "chat topics: send"
  on realtime.messages for insert
  to authenticated
  with check (realtime.messages.extension in ('broadcast') and public.chat_topic_can_send(realtime.topic()));
