-- Run once in the Supabase Dashboard SQL Editor.
-- Lets the room list sort "newest message on top" (Zalo-style) — sếp Phúc:
-- with many busy rooms it was hard to tell which one a ding came from.
-- Kept up to date by a trigger on every new message, so the room list's
-- existing realtime UPDATE subscription on meeting_channels also moves a
-- room to the top live, the moment a message lands in it.

alter table public.meeting_channels add column if not exists last_message_at timestamptz;

-- Backfill from existing history.
update public.meeting_channels c
set last_message_at = sub.latest
from (
  select channel_id, max(created_at) as latest
  from public.meeting_messages
  group by channel_id
) sub
where sub.channel_id = c.id;

-- security definer: the person posting a message isn't necessarily allowed
-- to UPDATE the room row itself under meeting_channels' own RLS.
create or replace function public.touch_channel_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.meeting_channels
     set last_message_at = new.created_at
   where id = new.channel_id
     and (last_message_at is null or last_message_at < new.created_at);
  return new;
end;
$$;

drop trigger if exists meeting_messages_touch_channel on public.meeting_messages;
create trigger meeting_messages_touch_channel
  after insert on public.meeting_messages
  for each row execute procedure public.touch_channel_last_message();
