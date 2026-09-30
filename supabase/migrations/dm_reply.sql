-- Tin nhắn cá nhân: reply to one specific message, the same as rooms do
-- (meeting_messages.reply_to_message_id). If the quoted message is ever
-- deleted, the reply stays and just shows "Tin nhắn gốc — đã bị xoá".
-- Run once in the Supabase Dashboard SQL Editor.

alter table public.direct_messages
  add column if not exists reply_to_message_id uuid references public.direct_messages (id) on delete set null;
