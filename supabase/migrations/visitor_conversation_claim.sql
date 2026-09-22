-- Run once in the Supabase Dashboard SQL Editor.
-- Lets a visitor_conversations row record which signed-in client it became,
-- once a "Work With Funti" visitor who chatted anonymously (guest chat
-- embedded on /cong-viec, same table as the floating "Chat với chúng tôi"
-- widget) registers an account — see claimVisitorConversation() in
-- lib/actions/clientPortal.ts. No RLS change needed: the claim runs through
-- the service-role client, same as every other visitor-chat write.
alter table public.visitor_conversations
  add column if not exists claimed_by_client_id uuid references public.clients (id) on delete set null;
