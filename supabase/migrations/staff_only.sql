-- Chỉ nhân viên (5/11/2026). sếp Phúc: người lạ chat với Funti, khách
-- hàng, khách vãng lai không được vào phần của nhân viên.
--
-- Anyone can get a signed-in session — the website chat's email link
-- (/cong-viec) signs a customer in — and most staff tables only said
-- "to authenticated using (true)". A customer's account could read the team
-- list with phone numbers and addresses, attendance, the calendar and hour
-- reports, and read, change or delete work cards, boards, comments, mind
-- maps and food orders; it could also listen in on, and post to, the
-- general and food rooms' live chat channel. The /workspace pages already
-- sent customers away; the data behind them didn't stop them.
--
-- 1) public.is_staff(): the caller has a staff profile (a profiles row —
--    made only by Quản trị → Nhân sự since salary_privacy.sql).
-- 2) Every table in public gets a RESTRICTIVE "staff only" policy: on top
--    of whatever its own policies allow, a caller without a staff profile
--    gets nothing. Left out: the public website's content (projects,
--    news_posts, job_postings, reviews, site_settings), the contact form
--    (contact_messages) and the customers' own portal (clients,
--    client_projects, client_messages) — their own policies already keep a
--    customer to their own rows. A staff table added later: run this file
--    again.
-- 3) Storage: the staff buckets (task and meeting files, editor, fonts,
--    brushes, ID papers, document library) are staff-only. Customers'
--    uploads (client-uploads) can no longer be listed by anyone, nor
--    deleted by any signed-in account. Files still open by their link.
-- 4) Live chat: listening to or sending on a staff channel (rooms, DMs,
--    inboxes) needs a staff profile.
--
-- The last query lists any table still without the lock — it should come
-- back empty ("Success. No rows returned").
--
-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.

-- 1. Who is staff
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- 2. Staff tables: nothing for anyone without a staff profile
do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and pg_get_userbyid(c.relowner) = current_user
      and c.relname not in (
        'projects', 'news_posts', 'job_postings', 'reviews', 'site_settings',
        'contact_messages', 'clients', 'client_projects', 'client_messages'
      )
  loop
    execute format('drop policy if exists "staff only" on public.%I', t);
    execute format(
      'create policy "staff only" on public.%I as restrictive for all to anon, authenticated '
      || 'using ((select public.is_staff())) with check ((select public.is_staff()))',
      t
    );
  end loop;
end $$;

-- 3. Storage
drop policy if exists "staff buckets are staff only" on storage.objects;
create policy "staff buckets are staff only"
  on storage.objects as restrictive
  for all
  to anon, authenticated
  using (
    bucket_id not in ('task-attachments', 'editor-uploads', 'fonts', 'brushes', 'staff-id-documents', 'documents-library')
    or (select public.is_staff())
  )
  with check (
    bucket_id not in ('task-attachments', 'editor-uploads', 'fonts', 'brushes', 'staff-id-documents', 'documents-library')
    or (select public.is_staff())
  );

-- Customers' files: the uploader (an upload reads its own row back), or
-- whoever answers customers (Giám đốc, PM, admin).
drop policy if exists "anyone can view client files" on storage.objects;
drop policy if exists "uploader or customer team can see client files" on storage.objects;
create policy "uploader or customer team can see client files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'client-uploads'
    and (
      owner_id = (select auth.uid())::text
      or owner = (select auth.uid())
      or public.current_access_role() = 'admin'
      or public.is_director_or_pm()
    )
  );

drop policy if exists "authenticated can delete client files" on storage.objects;
drop policy if exists "uploader or customer team can delete client files" on storage.objects;
create policy "uploader or customer team can delete client files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'client-uploads'
    and (
      owner_id = (select auth.uid())::text
      or owner = (select auth.uid())
      or public.current_access_role() = 'admin'
      or public.is_director_or_pm()
    )
  );

-- 4. Live chat channels (same rules as performance_night.sql, staff only)
create or replace function public.chat_topic_can_receive(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff() and case
    when p_topic like 'room:%' then
      exists (
        select 1 from public.meeting_channels c
        where c.id::text = substr(p_topic, 6) and (c.is_general or c.is_food_room)
      )
      or exists (
        select 1 from public.meeting_channel_members m
        where m.channel_id::text = substr(p_topic, 6) and m.profile_id = auth.uid()
      )
      or public.current_access_role() = 'director'
    when p_topic like 'inbox:%' then substr(p_topic, 7) = auth.uid()::text
    when p_topic ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
      auth.uid()::text in (substr(p_topic, 4, 36), substr(p_topic, 41, 36))
    else false
  end;
$$;

create or replace function public.chat_topic_can_send(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff() and case
    when p_topic like 'room:%' then
      exists (
        select 1 from public.meeting_channels c
        where c.id::text = substr(p_topic, 6) and (c.is_general or c.is_food_room)
      )
      or exists (
        select 1 from public.meeting_channel_members m
        where m.channel_id::text = substr(p_topic, 6) and m.profile_id = auth.uid()
      )
    when p_topic like 'inbox:%' then
      exists (select 1 from public.profiles p where p.id = auth.uid())
    when p_topic ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
      auth.uid()::text in (substr(p_topic, 4, 36), substr(p_topic, 41, 36))
    else false
  end;
$$;

-- Check: any table still open to customers. Should return no rows.
select c.relname as table_name,
       case when not c.relrowsecurity then 'RLS is off' else 'no "staff only" rule' end as problem
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname not in (
    'projects', 'news_posts', 'job_postings', 'reviews', 'site_settings',
    'contact_messages', 'clients', 'client_projects', 'client_messages'
  )
  and (
    not c.relrowsecurity
    or not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'staff only'
    )
  )
order by 1;
