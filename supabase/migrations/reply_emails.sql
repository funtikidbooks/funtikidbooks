-- Câu trả lời tới tay khách dù khách đã rời web (28/10/2026).
-- Customers write in their evening — the Vietnamese night — and by the time
-- the studio answers next morning they've left the site. Studio replies the
-- customer hasn't seen on the site now go out by email (lib/replyEmails.ts,
-- run by the database's every-minute ping to /api/chat/push-hook).
--
-- reply_email_upto: studio replies up to this moment were emailed, seen on
--   the site, or answered by the customer — nothing up to it is ever
--   emailed. Defaults to now(): every message from before this file runs
--   (and before a conversation starts) stays out of it.
-- reply_emailed_at: when the last email actually went out (shown to staff
--   in Khách hàng).
--
-- Run once in the Supabase Dashboard SQL Editor, after customer_waiting.sql.

alter table public.visitor_conversations
  add column if not exists reply_email_upto timestamptz not null default now(),
  add column if not exists reply_emailed_at timestamptz;

alter table public.client_projects
  add column if not exists reply_email_upto timestamptz not null default now(),
  add column if not exists reply_emailed_at timestamptz;
