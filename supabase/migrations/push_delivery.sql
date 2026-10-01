-- Thông báo nhanh và đo được:
-- 1. Each device reports when it actually showed a notification and how
--    long after the server sent it (sw.js → /api/push/ack) — Quản trị →
--    Thông báo trên máy shows every device's real delay, so a phone that
--    receives late is seen, not guessed.
-- 2. The database pings the push hook every minute so the function that
--    sends notifications is already running when a message comes — no
--    cold start (up to ~1s) in front of the push.
-- Run once in the Supabase Dashboard SQL Editor, after push_health.sql and
-- chat_push_hook.sql.

alter table public.push_subscriptions
  add column if not exists last_delivered_at timestamptz,
  add column if not exists last_delivery_ms integer;

select cron.schedule(
  'chat-push-warm',
  '* * * * *',
  $$select net.http_post(
      url := 'https://funtikidbooks.com/api/chat/push-hook',
      body := '{"type":"ping"}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    )$$
);
