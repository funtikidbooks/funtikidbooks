-- Run once in the Supabase Dashboard SQL Editor.
-- New tables + storage bucket for the public "Công việc" client portal —
-- see schema.sql's own copy of this block for the full explanation.

-- ---------------------------------------------------------------------------
-- clients / client_projects / client_messages: the public "Công việc" portal
-- (src/app/(site)/cong-viec) — a real (mostly international) customer signs
-- in with a magic-link email, no password, completely separate from staff
-- auth.users rows in `profiles`. A client submits a project brief (own row
-- in client_projects), then talks back and forth with staff in
-- client_messages, same shape as visitor_conversations/visitor_messages but
-- owned by a real signed-in identity instead of a localStorage token.
-- Visible to staff only in the director/PM's own workspace view
-- (/workspace/khach-hang) — see is_director_or_pm() above.
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  country text,
  avatar_url text,
  client_type text not null default 'individual' check (client_type in ('individual', 'business')),
  created_at timestamptz not null default now()
);

create table if not exists public.client_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  description text not null,
  image_urls jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.client_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.client_projects (id) on delete cascade,
  sender_type text not null check (sender_type in ('client', 'staff')),
  sender_id uuid,
  content text not null,
  image_urls jsonb not null default '[]'::jsonb,
  -- Only the side that DIDN'T write the message starts unread — a staff
  -- reply starts read_by_staff=true/read_by_client=false and vice versa.
  -- The client portal's "Công việc" badge counts read_by_client=false rows
  -- across all of one client's projects.
  read_by_client boolean not null default false,
  read_by_staff boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;
alter table public.client_projects enable row level security;
alter table public.client_messages enable row level security;

drop policy if exists "client can read own profile" on public.clients;
create policy "client can read own profile"
  on public.clients for select
  to authenticated
  using (id = auth.uid() or public.current_access_role() = 'admin' or public.is_director_or_pm());

drop policy if exists "client can create own profile" on public.clients;
create policy "client can create own profile"
  on public.clients for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "client can update own profile" on public.clients;
create policy "client can update own profile"
  on public.clients for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "read own or staff-managed projects" on public.client_projects;
create policy "read own or staff-managed projects"
  on public.client_projects for select
  to authenticated
  using (client_id = auth.uid() or public.current_access_role() = 'admin' or public.is_director_or_pm());

drop policy if exists "client can create own projects" on public.client_projects;
create policy "client can create own projects"
  on public.client_projects for insert
  to authenticated
  with check (client_id = auth.uid());

drop policy if exists "update own or staff-managed projects" on public.client_projects;
create policy "update own or staff-managed projects"
  on public.client_projects for update
  to authenticated
  using (client_id = auth.uid() or public.current_access_role() = 'admin' or public.is_director_or_pm())
  with check (client_id = auth.uid() or public.current_access_role() = 'admin' or public.is_director_or_pm());

drop policy if exists "read own or staff-managed project messages" on public.client_messages;
create policy "read own or staff-managed project messages"
  on public.client_messages for select
  to authenticated
  using (
    exists (select 1 from public.client_projects cp where cp.id = project_id and cp.client_id = auth.uid())
    or public.current_access_role() = 'admin'
    or public.is_director_or_pm()
  );

drop policy if exists "client can send own messages" on public.client_messages;
create policy "client can send own messages"
  on public.client_messages for insert
  to authenticated
  with check (
    sender_type = 'client'
    and exists (select 1 from public.client_projects cp where cp.id = project_id and cp.client_id = auth.uid())
  );

drop policy if exists "staff can send replies to clients" on public.client_messages;
create policy "staff can send replies to clients"
  on public.client_messages for insert
  to authenticated
  with check (
    sender_type = 'staff'
    and (public.current_access_role() = 'admin' or public.is_director_or_pm())
  );

drop policy if exists "update own or staff-managed project messages" on public.client_messages;
create policy "update own or staff-managed project messages"
  on public.client_messages for update
  to authenticated
  using (
    exists (select 1 from public.client_projects cp where cp.id = project_id and cp.client_id = auth.uid())
    or public.current_access_role() = 'admin'
    or public.is_director_or_pm()
  )
  with check (
    exists (select 1 from public.client_projects cp where cp.id = project_id and cp.client_id = auth.uid())
    or public.current_access_role() = 'admin'
    or public.is_director_or_pm()
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'client_messages'
  ) then
    alter publication supabase_realtime add table public.client_messages;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('client-uploads', 'client-uploads', true, 20971520) -- 20MB
on conflict (id) do update set file_size_limit = 20971520;

drop policy if exists "authenticated can upload client files" on storage.objects;
create policy "authenticated can upload client files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'client-uploads');

drop policy if exists "authenticated can delete client files" on storage.objects;
create policy "authenticated can delete client files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'client-uploads');

drop policy if exists "anyone can view client files" on storage.objects;
create policy "anyone can view client files"
  on storage.objects for select
  to public
  using (bucket_id = 'client-uploads');
