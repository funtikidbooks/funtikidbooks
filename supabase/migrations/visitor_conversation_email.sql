-- Run once in the Supabase Dashboard SQL Editor.
-- Lets the "chat with us" widget collect the visitor's email so staff can
-- follow up outside the chat, and so the new-message notification email
-- (lib/mail.ts's sendNewVisitorMessageEmail) can show it.
alter table public.visitor_conversations add column if not exists visitor_email text;
