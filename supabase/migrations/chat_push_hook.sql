-- Thông báo nhạy hơn: the database announces every new chat message itself.
-- Until now a push only went out if the SENDER's browser, right after
-- saving the message, called /api/chat/notify — a phone locked straight
-- after sending, a weak connection, or a message sent later from the
-- offline outbox could mean nobody was ever notified. Now the insert
-- itself calls /api/chat/push-hook (pg_net, asynchronous — it never slows
-- the insert), and chat_push_log makes sure each message is pushed once,
-- whichever of the two calls arrives first.
-- Run once in the Supabase Dashboard SQL Editor.

create extension if not exists pg_net;

-- One row per message already pushed (the "claim"). Service role only.
create table if not exists public.chat_push_log (
  message_id uuid primary key,
  sent_at timestamptz not null default now()
);
alter table public.chat_push_log enable row level security;

create or replace function public.chat_push_hook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://funtikidbooks.com/api/chat/push-hook',
    body := jsonb_build_object(
      'type', case when tg_table_name = 'direct_messages' then 'dm' else 'meeting' end,
      'id', new.id
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function public.chat_push_hook() from public, anon, authenticated;

drop trigger if exists meeting_messages_push_hook on public.meeting_messages;
create trigger meeting_messages_push_hook
  after insert on public.meeting_messages
  for each row execute function public.chat_push_hook();

drop trigger if exists direct_messages_push_hook on public.direct_messages;
create trigger direct_messages_push_hook
  after insert on public.direct_messages
  for each row execute function public.chat_push_hook();

-- Keep the claim table small: a week is plenty (only messages under ten
-- minutes old are ever pushed).
select cron.schedule(
  'chat-push-log-cleanup',
  '30 17 * * *',
  $$delete from public.chat_push_log where sent_at < now() - interval '7 days'$$
);
