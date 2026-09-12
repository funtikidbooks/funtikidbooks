-- Run once in the Supabase Dashboard SQL Editor.
-- Widens "Chat khách vãng lai" (visitor_conversations/visitor_messages)
-- from director/admin-only to also include Project Manager, matching
-- is_director_or_pm() used elsewhere — lets Alice Đỗ (PM) open and reply
-- to customer chats, not just receive the notification for one.

drop policy if exists "admin/director can read visitor conversations" on public.visitor_conversations;
drop policy if exists "director/PM can read visitor conversations" on public.visitor_conversations;
create policy "director/PM can read visitor conversations"
  on public.visitor_conversations for select
  to authenticated
  using (public.current_access_role() = 'admin' or public.is_director_or_pm());

drop policy if exists "admin/director can update visitor conversations" on public.visitor_conversations;
drop policy if exists "director/PM can update visitor conversations" on public.visitor_conversations;
create policy "director/PM can update visitor conversations"
  on public.visitor_conversations for update
  to authenticated
  using (public.current_access_role() = 'admin' or public.is_director_or_pm())
  with check (public.current_access_role() = 'admin' or public.is_director_or_pm());

drop policy if exists "admin/director can read visitor messages" on public.visitor_messages;
drop policy if exists "director/PM can read visitor messages" on public.visitor_messages;
create policy "director/PM can read visitor messages"
  on public.visitor_messages for select
  to authenticated
  using (public.current_access_role() = 'admin' or public.is_director_or_pm());

drop policy if exists "admin/director can send visitor replies" on public.visitor_messages;
drop policy if exists "director/PM can send visitor replies" on public.visitor_messages;
create policy "director/PM can send visitor replies"
  on public.visitor_messages for insert
  to authenticated
  with check (
    sender_type = 'staff'
    and sender_id = auth.uid()
    and (public.current_access_role() = 'admin' or public.is_director_or_pm())
  );
