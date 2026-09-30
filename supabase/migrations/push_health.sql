-- Thông báo trên máy: know which staff devices still receive notifications.
-- Until now a push_subscriptions row only said "this device once signed
-- up" — a phone whose subscription had quietly expired, or that hadn't
-- opened the app in weeks, looked exactly like a working one, and every
-- failed send was swallowed. These columns record, per device:
--   device        — what it is ("iPhone · app", "Windows · Chrome"…)
--   last_seen_at  — the app last re-confirmed the subscription (each open)
--   last_ok_at    — Apple/Google last accepted a notification for it
--   last_error_at / last_error — the last refusal and why
-- Quản trị → Nhân sự → Thông báo trên máy shows them per person.
-- Run once in the Supabase Dashboard SQL Editor.

alter table public.push_subscriptions
  add column if not exists device text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_ok_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error text;
