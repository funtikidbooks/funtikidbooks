-- "Đóng dự án": a closed room moves to the collapsed "Đã đóng" section of
-- the room list and becomes read-only. closed_at null = open.
alter table public.meeting_channels add column if not exists closed_at timestamptz;

-- Enforced in the database (messages are inserted straight from the browser),
-- not just by hiding the composer.
create or replace function public.block_message_in_closed_channel()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.meeting_channels c where c.id = new.channel_id and c.closed_at is not null) then
    raise exception 'Dự án đã đóng — mở lại để nhắn tin.';
  end if;
  return new;
end;
$$;

drop trigger if exists meeting_messages_block_closed on public.meeting_messages;
create trigger meeting_messages_block_closed
  before insert on public.meeting_messages
  for each row execute function public.block_message_in_closed_channel();
