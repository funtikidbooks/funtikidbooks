-- Khách chờ trả lời (28/10/2026): no customer message gets missed again.
-- Sếp Phúc: customer pings looked like coworker chat and were swiped away;
-- a client who asked for a quote at 00:31 on 23/10 was never answered, and
-- the Liên hệ form notified nobody at all.
--
-- 1) is_auto: the studio's automatic "thanks — while you wait, here's our
--    Facebook / Instagram" message. It's from the studio, but it is NOT a
--    reply: the customer stays "waiting" until a person answers.
-- 2) awaiting_reply_since: set when a customer writes and nobody has
--    answered yet, cleared by the first real staff reply (or "Không cần trả
--    lời"). Kept by a trigger, so every way a message gets in counts.
-- 3) reminder_step: how many "khách vẫn đang chờ" reminders went out for
--    the current wait (see lib/customerWaiting.ts).
-- 4) The Liên hệ form gets the same: handled_at ("Đã trả lời") and
--    reminder_step.
-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.

alter table public.visitor_messages add column if not exists is_auto boolean not null default false;
alter table public.client_messages add column if not exists is_auto boolean not null default false;

alter table public.visitor_conversations add column if not exists awaiting_reply_since timestamptz;
alter table public.visitor_conversations add column if not exists reminder_step smallint not null default 0;
alter table public.client_projects add column if not exists awaiting_reply_since timestamptz;
alter table public.client_projects add column if not exists reminder_step smallint not null default 0;
alter table public.contact_messages add column if not exists handled_at timestamptz;
alter table public.contact_messages add column if not exists reminder_step smallint not null default 0;

-- A customer message starts (or continues) the wait; a real staff reply
-- ends it. least() ignores NULL, so an ongoing wait keeps its first moment.
create or replace function public.track_customer_waiting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_auto then
    return new;
  end if;
  if tg_table_name = 'visitor_messages' then
    if new.sender_type = 'visitor' then
      update public.visitor_conversations
        set reminder_step = case when awaiting_reply_since is null then 0 else reminder_step end,
            awaiting_reply_since = least(awaiting_reply_since, new.created_at)
        where id = new.conversation_id;
    else
      update public.visitor_conversations
        set awaiting_reply_since = null, reminder_step = 0
        where id = new.conversation_id;
    end if;
  else
    if new.sender_type = 'client' then
      update public.client_projects
        set reminder_step = case when awaiting_reply_since is null then 0 else reminder_step end,
            awaiting_reply_since = least(awaiting_reply_since, new.created_at)
        where id = new.project_id;
    else
      update public.client_projects
        set awaiting_reply_since = null, reminder_step = 0
        where id = new.project_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.track_customer_waiting() from public, anon, authenticated;

drop trigger if exists visitor_messages_track_waiting on public.visitor_messages;
create trigger visitor_messages_track_waiting
  after insert on public.visitor_messages
  for each row execute function public.track_customer_waiting();

drop trigger if exists client_messages_track_waiting on public.client_messages;
create trigger client_messages_track_waiting
  after insert on public.client_messages
  for each row execute function public.track_customer_waiting();

-- What's waiting right now (last 30 days — older ones were tests).
update public.visitor_conversations c
  set awaiting_reply_since = w.since
  from (
    select m.conversation_id, min(m.created_at) as since
    from public.visitor_messages m
    where m.sender_type = 'visitor'
      and m.created_at > coalesce(
        (select max(s.created_at) from public.visitor_messages s
          where s.conversation_id = m.conversation_id and s.sender_type = 'staff'),
        '-infinity'::timestamptz)
    group by m.conversation_id
  ) w
  where w.conversation_id = c.id
    and c.status = 'open'
    and c.claimed_by_client_id is null
    and c.awaiting_reply_since is null
    and w.since > now() - interval '30 days';

update public.client_projects p
  set awaiting_reply_since = coalesce(w.since, p.created_at)
  from (
    select pr.id,
      (select min(m.created_at) from public.client_messages m
        where m.project_id = pr.id and m.sender_type = 'client'
          and m.created_at > coalesce(
            (select max(s.created_at) from public.client_messages s
              where s.project_id = pr.id and s.sender_type = 'staff'),
            '-infinity'::timestamptz)) as since,
      exists (select 1 from public.client_messages s where s.project_id = pr.id and s.sender_type = 'staff') as answered,
      exists (select 1 from public.client_messages m where m.project_id = pr.id) as has_messages
    from public.client_projects pr
  ) w
  where w.id = p.id
    and p.status = 'open'
    and p.awaiting_reply_since is null
    and (w.since is not null or (not w.answered and not w.has_messages))
    and coalesce(w.since, p.created_at) > now() - interval '30 days';

-- A brand-new project (the client's brief) is waiting from the start.
alter table public.client_projects alter column awaiting_reply_since set default now();

-- Liên hệ form: anything older than two weeks counts as dealt with.
update public.contact_messages set handled_at = now()
  where handled_at is null and created_at < now() - interval '14 days';

-- Only staff read the Liên hệ form. It used to be "any signed-in account",
-- which also let a Công việc client account read everyone's name, email and
-- phone. Staff mark entries "Đã trả lời" through the server (service role).
drop policy if exists "staff can read contact messages" on public.contact_messages;
create policy "staff can read contact messages"
  on public.contact_messages for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()));

-- The top bar hears a new Liên hệ entry live, like chat messages.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contact_messages'
  ) then
    alter publication supabase_realtime add table public.contact_messages;
  end if;
end $$;
