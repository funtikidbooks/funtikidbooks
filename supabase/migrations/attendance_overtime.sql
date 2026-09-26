-- Run once in the Supabase Dashboard SQL Editor.
-- Marks an attendance row a director/PM entered for someone who came in on
-- a day that's off by default (a "Ngày nghỉ" on the shared calendar, or a
-- Sunday) — "tăng ca". Such a row wins over the calendar's day off in every
-- attendance view and counts as a ngày công; a row without the mark keeps
-- the old rule (the calendar's day off wins over a stale auto check-in).
alter table public.attendance add column if not exists overtime boolean not null default false;
