-- Funti Kidbooks Studio — Member Workspace schema
-- Run this once in the Supabase project's SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per staff account, mirrors auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_url text,
  role text,
  access_role text not null default 'staff' check (access_role in ('director', 'admin', 'staff')),
  created_at timestamptz not null default now()
);

-- Added after the initial table creation — safe to re-run on an existing project.
alter table public.profiles add column if not exists access_role text not null default 'staff';
alter table public.profiles drop constraint if exists profiles_access_role_check;
alter table public.profiles add constraint profiles_access_role_check check (access_role in ('director', 'admin', 'staff'));

-- Dark/light choice tied to the account instead of only the browser's
-- localStorage — localStorage can get wiped on its own (Safari's 7-day ITP
-- purge for inactive sites, "clear on exit" settings...), which showed up
-- to staff as the theme randomly reverting to light. Null = no choice made
-- yet, falls back to the client-only localStorage behavior.
alter table public.profiles add column if not exists theme text;
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check check (theme is null or theme in ('light', 'dark'));

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by any signed-in staff" on public.profiles;
create policy "profiles are readable by any signed-in staff"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "a user can update their own profile" on public.profiles;
create policy "a user can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and access_role = (select p.access_role from public.profiles p where p.id = auth.uid()));

drop policy if exists "a director can update any profile" on public.profiles;
create policy "a director can update any profile"
  on public.profiles for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.access_role = 'director'));

-- The very first person to sign up on a fresh project has no one to grant
-- them the director role, so promote them manually once via the SQL Editor:
--   update public.profiles set access_role = 'director' where email = 'you@example.com';

-- Auto-create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Self-service profile fields (avatar/phone/address editable by the member
-- themselves; `role` — job title — stays director-only, see the update
-- policy above which only blocks access_role from self-changing).
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address text;
-- Thành viên directory filter tabs turned out to just want `role` (the
-- free-text job title, e.g. "Junior Illustrator") — this separate
-- director-assigned category never got used for anything else.
alter table public.profiles drop column if exists department;
-- Actual employment start date, director-editable — separate from
-- created_at (when the login account was created, which can lag behind
-- when someone actually joined the studio). Falls back to created_at
-- when null.
alter table public.profiles add column if not exists joined_at timestamptz;

-- ---------------------------------------------------------------------------
-- direct_messages: 1:1 chat between staff members, shown in the workspace
-- sidebar. One row per message, with at most one optional attachment.
-- ---------------------------------------------------------------------------
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  attachment_url text,
  attachment_filename text,
  attachment_mime text,
  attachment_size integer,
  created_at timestamptz not null default now()
);
create index if not exists direct_messages_pair_idx
  on public.direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);

-- Messenger-style "Đã xem" receipt — set by the recipient (never the sender)
-- the moment they have the conversation open, so the sender's own window can
-- show exactly which of their messages the other person has actually seen.
alter table public.direct_messages add column if not exists read_at timestamptz;

alter table public.direct_messages enable row level security;

drop policy if exists "staff can read their own conversations" on public.direct_messages;
create policy "staff can read their own conversations"
  on public.direct_messages for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "staff can send messages as themselves" on public.direct_messages;
create policy "staff can send messages as themselves"
  on public.direct_messages for insert
  to authenticated
  with check (auth.uid() = sender_id);

drop policy if exists "recipient can mark messages read" on public.direct_messages;
create policy "recipient can mark messages read"
  on public.direct_messages for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Required for the chat window to receive new messages live. Wrapped so
-- re-running this script doesn't error if it's already a publication member.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;

-- direct_message_reactions: same idea as meeting_message_reactions, but for
-- a 1:1 conversation — one row per (message, person, emoji). Read/insert/
-- delete are all gated on being one of the two people in that conversation
-- (checked via the parent direct_messages row) rather than room membership.
create table if not exists public.direct_message_reactions (
  message_id uuid not null references public.direct_messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);

alter table public.direct_message_reactions enable row level security;

drop policy if exists "conversation members can read reactions" on public.direct_message_reactions;
create policy "conversation members can read reactions"
  on public.direct_message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.direct_messages dm
      where dm.id = direct_message_reactions.message_id
        and (dm.sender_id = auth.uid() or dm.recipient_id = auth.uid())
    )
  );

drop policy if exists "staff can react as themselves in dm" on public.direct_message_reactions;
create policy "staff can react as themselves in dm"
  on public.direct_message_reactions for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.direct_messages dm
      where dm.id = direct_message_reactions.message_id
        and (dm.sender_id = auth.uid() or dm.recipient_id = auth.uid())
    )
  );

drop policy if exists "staff can remove their own dm reaction" on public.direct_message_reactions;
create policy "staff can remove their own dm reaction"
  on public.direct_message_reactions for delete
  to authenticated
  using (profile_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_message_reactions'
  ) then
    alter publication supabase_realtime add table public.direct_message_reactions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- dm_reads: per-user "I've read this conversation up to here" marker, one row
-- per (me, peer) pair. Used to compute the unread-message badge shown next
-- to each teammate in the workspace sidebar.
-- ---------------------------------------------------------------------------
create table if not exists public.dm_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  peer_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, peer_id)
);

alter table public.dm_reads enable row level security;

drop policy if exists "staff can manage their own read state" on public.dm_reads;
create policy "staff can manage their own read state"
  on public.dm_reads for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- push_subscriptions: Web Push endpoints registered from a staff member's
-- browser (desktop, or an iPad after "Add to Home Screen"). One row per
-- device — a person can have several. Used to push real OS notifications
-- for new chat messages even when the site isn't the focused tab/app.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "staff can manage their own push subscriptions" on public.push_subscriptions;
create policy "staff can manage their own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- boards / board_columns / tasks — the Kanban data model
-- ---------------------------------------------------------------------------
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  color text not null default '#FF7A3D',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  title text not null,
  color text not null default '#78776F',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  column_id uuid not null references public.board_columns (id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  progress smallint not null default 0 check (progress between 0 and 100),
  position integer not null default 0,
  cover_image_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added after the initial table creation — safe to re-run on an existing project.
alter table public.tasks add column if not exists cover_image_url text;
alter table public.tasks add column if not exists labels text[] not null default '{}';
-- Progress is now computed live from start_date → due_date (see
-- src/lib/taskProgress.ts) rather than the manually-set `progress` column
-- above, which stays only for backward compatibility and is no longer read.
alter table public.tasks add column if not exists start_date date;

-- Multiple members per task (group projects) — the legacy single assignee_id
-- column above stays for backward compatibility but new assignments go here.
create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);
create index if not exists task_assignees_task_id_idx on public.task_assignees (task_id);
alter table public.task_assignees enable row level security;
drop policy if exists "staff can read task assignees" on public.task_assignees;
create policy "staff can read task assignees" on public.task_assignees for select to authenticated using (true);
drop policy if exists "staff can write task assignees" on public.task_assignees;
create policy "staff can write task assignees" on public.task_assignees for all to authenticated using (true) with check (true);

-- Backfill so existing tasks keep whoever was already assigned to them.
insert into public.task_assignees (task_id, profile_id)
select id, assignee_id from public.tasks where assignee_id is not null
on conflict do nothing;

create index if not exists tasks_column_id_idx on public.tasks (column_id);
create index if not exists board_columns_board_id_idx on public.board_columns (board_id);

alter table public.boards enable row level security;
alter table public.board_columns enable row level security;
alter table public.tasks enable row level security;

-- This is an internal studio tool: any signed-in staff account can see and
-- edit every board/column/task. Tighten these policies later if per-project
-- access control becomes necessary.
drop policy if exists "staff can read boards" on public.boards;
create policy "staff can read boards" on public.boards for select to authenticated using (true);
drop policy if exists "staff can write boards" on public.boards;
create policy "staff can write boards" on public.boards for all to authenticated using (true) with check (true);

drop policy if exists "staff can read columns" on public.board_columns;
create policy "staff can read columns" on public.board_columns for select to authenticated using (true);
drop policy if exists "staff can write columns" on public.board_columns;
create policy "staff can write columns" on public.board_columns for all to authenticated using (true) with check (true);

drop policy if exists "staff can read tasks" on public.tasks;
create policy "staff can read tasks" on public.tasks for select to authenticated using (true);
drop policy if exists "staff can write tasks" on public.tasks;
create policy "staff can write tasks" on public.tasks for all to authenticated using (true) with check (true);

-- keep updated_at current on every task edit
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contact_messages: submissions from the public "Liên hệ" form
-- ---------------------------------------------------------------------------
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  project_type text,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

drop policy if exists "anyone can submit the contact form" on public.contact_messages;
create policy "anyone can submit the contact form"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);

drop policy if exists "staff can read contact messages" on public.contact_messages;
create policy "staff can read contact messages"
  on public.contact_messages for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Task detail (Giai đoạn 2): checklist, bình luận/trò chuyện, đính kèm ảnh
-- ---------------------------------------------------------------------------
create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  comment_id uuid references public.task_comments (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  url text not null,
  storage_path text not null,
  filename text not null,
  mime_type text not null,
  size integer not null,
  created_at timestamptz not null default now()
);

-- Arbitrary URLs a member wants pinned to the card, distinct from uploaded
-- files (task_attachments) — e.g. a link to a related Drive doc or board.
create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  label text not null,
  url text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Audit trail merged with comments in the card's activity feed — one row
-- per notable event (card created, moved between lists, member assigned,
-- file attached). `metadata` carries the type-specific detail to render.
create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Broaden attachments beyond images now that briefs/specs (PDFs) are common.
alter table public.task_attachments alter column mime_type drop not null;

create index if not exists task_checklist_items_task_id_idx on public.task_checklist_items (task_id);
create index if not exists task_comments_task_id_idx on public.task_comments (task_id);
create index if not exists task_attachments_task_id_idx on public.task_attachments (task_id);
create index if not exists task_links_task_id_idx on public.task_links (task_id);
create index if not exists task_activity_task_id_idx on public.task_activity (task_id);

alter table public.task_checklist_items enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_links enable row level security;
alter table public.task_activity enable row level security;

drop policy if exists "staff can read links" on public.task_links;
create policy "staff can read links" on public.task_links for select to authenticated using (true);
drop policy if exists "staff can write links" on public.task_links;
create policy "staff can write links" on public.task_links for all to authenticated using (true) with check (true);

drop policy if exists "staff can read activity" on public.task_activity;
create policy "staff can read activity" on public.task_activity for select to authenticated using (true);
drop policy if exists "staff can write activity" on public.task_activity;
create policy "staff can write activity" on public.task_activity for all to authenticated using (true) with check (true);

drop policy if exists "staff can read checklist items" on public.task_checklist_items;
create policy "staff can read checklist items" on public.task_checklist_items for select to authenticated using (true);
drop policy if exists "staff can write checklist items" on public.task_checklist_items;
create policy "staff can write checklist items" on public.task_checklist_items for all to authenticated using (true) with check (true);

drop policy if exists "staff can read comments" on public.task_comments;
create policy "staff can read comments" on public.task_comments for select to authenticated using (true);
drop policy if exists "staff can write comments" on public.task_comments;
create policy "staff can write comments" on public.task_comments for all to authenticated using (true) with check (true);

drop policy if exists "staff can read attachments" on public.task_attachments;
create policy "staff can read attachments" on public.task_attachments for select to authenticated using (true);
drop policy if exists "staff can write attachments" on public.task_attachments;
create policy "staff can write attachments" on public.task_attachments for all to authenticated using (true) with check (true);

-- Storage bucket for task cover / comment images. Public read so <img> tags
-- can load them directly; writes are restricted to signed-in staff.
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', true)
on conflict (id) do nothing;

drop policy if exists "staff can upload task attachments" on storage.objects;
create policy "staff can upload task attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'task-attachments');

drop policy if exists "staff can delete task attachments" on storage.objects;
create policy "staff can delete task attachments"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'task-attachments');

drop policy if exists "anyone can view task attachments" on storage.objects;
create policy "anyone can view task attachments"
  on storage.objects for select
  to public
  using (bucket_id = 'task-attachments');

-- ---------------------------------------------------------------------------
-- Access-role helper — used by RLS policies below instead of repeating the
-- subquery. security definer so it can read profiles regardless of the
-- caller's own row-level policies.
-- ---------------------------------------------------------------------------
create or replace function public.current_access_role()
returns text
language sql
security definer set search_path = public
stable
as $$
  select access_role from public.profiles where id = auth.uid();
$$;

-- Grants staff whose chức danh (job title) is exactly "Project Manager"
-- the same access as the director to three specific HR/finance tools
-- (chấm công, bảng lương, hoá đơn) without changing their access_role —
-- everything else they can do stays plain "staff". Chức danh is a
-- free-text field (see lib/constants/staff.ts), so this only matches an
-- exact "Project Manager" string, not a fuzzy/case-insensitive one.
create or replace function public.can_manage_hr()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (access_role = 'director' or role = 'Project Manager')
  );
$$;

-- Same "director or exact chức danh 'Project Manager'" rule as
-- can_manage_hr(), under a name that isn't HR-specific — used to gate
-- renaming "Chung" and the "Riêng" tab label (see meeting_channels' update
-- policy and workspace_room_labels below).
create or replace function public.is_director_or_pm()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (access_role = 'director' or role = 'Project Manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- projects: the public "Dự án" portfolio, editable by director/admin
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tag text not null,
  description text,
  cover_image_url text,
  published boolean not null default true,
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added after the initial table creation — safe to re-run on an existing project.
alter table public.projects add column if not exists gallery_images text[] not null default '{}';
-- Rich HTML case-study body (text interspersed with images), edited with the
-- same block-style editor as news posts — shown in the Behance-style lightbox.
alter table public.projects add column if not exists content text;
-- English variants for the public site's language toggle — optional, falls
-- back to the Vietnamese field when empty.
alter table public.projects add column if not exists title_en text;
alter table public.projects add column if not exists description_en text;
alter table public.projects add column if not exists content_en text;
-- View/like counters shown on the public /du-an cards. Bumped by anonymous
-- visitors, so they're incremented through SECURITY DEFINER functions below
-- rather than direct table writes (visitors never get UPDATE on the table).
alter table public.projects add column if not exists view_count integer not null default 0;
alter table public.projects add column if not exists like_count integer not null default 0;

alter table public.projects enable row level security;

drop policy if exists "anyone can read published projects" on public.projects;
create policy "anyone can read published projects"
  on public.projects for select
  to anon, authenticated
  using (published or public.current_access_role() in ('director', 'admin'));

drop policy if exists "director and admin can write projects" on public.projects;
create policy "director and admin can write projects"
  on public.projects for all
  to authenticated
  using (public.current_access_role() in ('director', 'admin'))
  with check (public.current_access_role() in ('director', 'admin'));

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute procedure public.set_updated_at();

-- Visitors have no write access to public.projects (see the RLS policy
-- above), so the view/like counters are bumped through these narrow
-- SECURITY DEFINER functions instead — each touches only its one counter
-- column, nothing else on the row is writable this way.
create or replace function public.increment_project_view(project_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.projects set view_count = view_count + 1 where id = project_id;
$$;
grant execute on function public.increment_project_view(uuid) to anon, authenticated;

create or replace function public.set_project_like(project_id uuid, liked boolean)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.projects
  set like_count = greatest(0, like_count + (case when liked then 1 else -1 end))
  where id = project_id
  returning like_count;
$$;
grant execute on function public.set_project_like(uuid, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- news_posts: the public "Tin tức" blog, editable by director/admin
-- ---------------------------------------------------------------------------
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Studio',
  excerpt text,
  content text,
  cover_image_url text,
  published boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added after the initial table creation — safe to re-run on an existing
-- project. `slug` backs the SEO-friendly /tin-tuc/[slug] article page.
create extension if not exists "unaccent";
alter table public.news_posts add column if not exists gallery_images text[] not null default '{}';
alter table public.news_posts add column if not exists slug text;
-- English variants for the public site's language toggle — optional, falls
-- back to the Vietnamese field when empty.
alter table public.news_posts add column if not exists title_en text;
alter table public.news_posts add column if not exists excerpt_en text;
alter table public.news_posts add column if not exists content_en text;

update public.news_posts
set slug = trim(both '-' from regexp_replace(lower(unaccent(title)), '[^a-z0-9]+', '-', 'g')) || '-' || substr(id::text, 1, 8)
where slug is null;

alter table public.news_posts alter column slug set not null;
drop index if exists news_posts_slug_key;
create unique index news_posts_slug_key on public.news_posts (slug);

alter table public.news_posts enable row level security;

drop policy if exists "anyone can read published news" on public.news_posts;
create policy "anyone can read published news"
  on public.news_posts for select
  to anon, authenticated
  using (published or public.current_access_role() in ('director', 'admin'));

drop policy if exists "director and admin can write news" on public.news_posts;
create policy "director and admin can write news"
  on public.news_posts for all
  to authenticated
  using (public.current_access_role() in ('director', 'admin'))
  with check (public.current_access_role() in ('director', 'admin'));

drop trigger if exists news_posts_set_updated_at on public.news_posts;
create trigger news_posts_set_updated_at
  before update on public.news_posts
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reviews: customer testimonials shown on the public site, editable by
-- director/admin
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  avatar_url text,
  rating integer not null default 5 check (rating between 1 and 5),
  content text not null,
  published boolean not null default true,
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

drop policy if exists "anyone can read published reviews" on public.reviews;
create policy "anyone can read published reviews"
  on public.reviews for select
  to anon, authenticated
  using (published or public.current_access_role() in ('director', 'admin'));

drop policy if exists "director and admin can write reviews" on public.reviews;
create policy "director and admin can write reviews"
  on public.reviews for all
  to authenticated
  using (public.current_access_role() in ('director', 'admin'))
  with check (public.current_access_role() in ('director', 'admin'));

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- attendance: day-by-day presence log. check_in_at is stamped automatically
-- the first time someone loads the workspace each day (see
-- checkInIfNeeded() in lib/actions/attendance.ts) — staff can insert their
-- own check-in row but never edit it afterwards; only the director can
-- correct entries or mark someone absent/on leave.
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  status text not null default 'present' check (status in ('present', 'absent', 'leave')),
  note text,
  created_at timestamptz not null default now(),
  unique (profile_id, work_date)
);

-- Added after the initial table creation to capture the actual clock-in
-- time, not just a present/absent/leave flag.
alter table public.attendance add column if not exists check_in_at timestamptz;

alter table public.attendance enable row level security;

drop policy if exists "staff can read attendance" on public.attendance;
create policy "staff can read attendance"
  on public.attendance for select
  to authenticated
  using (true);

drop policy if exists "director can write attendance" on public.attendance;
drop policy if exists "staff can check in for themselves" on public.attendance;
create policy "staff can check in for themselves"
  on public.attendance for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "director can manage attendance" on public.attendance;
drop policy if exists "director or pm can manage attendance" on public.attendance;
create policy "director or pm can manage attendance"
  on public.attendance for all
  to authenticated
  using (public.can_manage_hr())
  with check (public.can_manage_hr());

-- ---------------------------------------------------------------------------
-- payroll_records: monthly salary sheet, director-only end to end — staff
-- never get a read policy here at all, unlike attendance. Line items
-- (allowances, bonuses, deductions) are stored as jsonb the same way
-- invoice items are, since they're always edited as a whole with the
-- record. The director's UI suggests deduction line items from that same
-- employee's attendance counts for the month, but nothing here is derived
-- automatically at the database level — it's just a starting point they
-- can edit freely.
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  month date not null,
  base_salary numeric not null default 0,
  items jsonb not null default '[]'::jsonb,
  note text,
  status text not null default 'draft' check (status in ('draft', 'paid')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, month)
);

alter table public.payroll_records enable row level security;

drop policy if exists "director can manage payroll" on public.payroll_records;
drop policy if exists "director or pm can manage payroll" on public.payroll_records;
create policy "director or pm can manage payroll"
  on public.payroll_records for all
  to authenticated
  using (public.can_manage_hr())
  with check (public.can_manage_hr());

drop trigger if exists payroll_records_set_updated_at on public.payroll_records;
create trigger payroll_records_set_updated_at
  before update on public.payroll_records
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- staff_salary: each employee's fixed monthly salary + the number of work
-- days the director considers "a full month" for them (default 24 — the
-- office runs Mon–Fri plus roughly 2 Saturdays a month). monthly_salary /
-- standard_work_days gives the daily rate the payroll screen suggests for
-- absent-day deductions. Director-only, same as payroll_records — staff
-- never get a read policy here.
-- ---------------------------------------------------------------------------
create table if not exists public.staff_salary (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  monthly_salary numeric not null default 0,
  standard_work_days integer not null default 24,
  updated_at timestamptz not null default now()
);

alter table public.staff_salary enable row level security;

drop policy if exists "director can manage staff salary" on public.staff_salary;
drop policy if exists "director or pm can manage staff salary" on public.staff_salary;
create policy "director or pm can manage staff salary"
  on public.staff_salary for all
  to authenticated
  using (public.can_manage_hr())
  with check (public.can_manage_hr());

drop trigger if exists staff_salary_set_updated_at on public.staff_salary;
create trigger staff_salary_set_updated_at
  before update on public.staff_salary
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- site_settings: small key/value store for editable page decoration, e.g.
-- header/hero illustrations, editable by director/admin from the live page.
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "anyone can read site settings" on public.site_settings;
create policy "anyone can read site settings"
  on public.site_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "director and admin can write site settings" on public.site_settings;
create policy "director and admin can write site settings"
  on public.site_settings for all
  to authenticated
  using (public.current_access_role() in ('director', 'admin'))
  with check (public.current_access_role() in ('director', 'admin'));

-- ---------------------------------------------------------------------------
-- Storage bucket for project/news cover images — public read, director/admin
-- write.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('site-content', 'site-content', true)
on conflict (id) do nothing;

-- Raise the per-file limit so process/behind-the-scenes videos can be
-- uploaded directly (default is much smaller). Uploaded straight from the
-- browser to Storage, so this isn't limited by the Next.js server action
-- body size cap.
update storage.buckets set file_size_limit = 314572800 where id = 'site-content'; -- 300MB

drop policy if exists "director and admin can upload site content" on storage.objects;
create policy "director and admin can upload site content"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-content' and public.current_access_role() in ('director', 'admin'));

drop policy if exists "director and admin can delete site content" on storage.objects;
create policy "director and admin can delete site content"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'site-content' and public.current_access_role() in ('director', 'admin'));

drop policy if exists "anyone can view site content" on storage.objects;
create policy "anyone can view site content"
  on storage.objects for select
  to public
  using (bucket_id = 'site-content');

-- ---------------------------------------------------------------------------
-- fonts: the workspace's shared font library ("Kho font & brush"). Any staff
-- account (director, admin, or staff) can upload typeface files for everyone
-- to browse/preview/download from inside the app; only the uploader or a
-- director can remove one.
-- ---------------------------------------------------------------------------
create table if not exists public.fonts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null,
  file_url text not null,
  file_ext text not null,
  size_bytes integer,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.fonts enable row level security;

drop policy if exists "staff can read fonts" on public.fonts;
create policy "staff can read fonts" on public.fonts for select to authenticated using (true);

drop policy if exists "director can add fonts" on public.fonts;
drop policy if exists "staff can add fonts" on public.fonts;
create policy "staff can add fonts"
  on public.fonts for insert
  to authenticated
  with check (public.current_access_role() in ('director', 'admin', 'staff'));

drop policy if exists "director can delete fonts" on public.fonts;
drop policy if exists "uploader or director can delete fonts" on public.fonts;
create policy "uploader or director can delete fonts"
  on public.fonts for delete
  to authenticated
  using (uploaded_by = auth.uid() or public.current_access_role() = 'director');

insert into storage.buckets (id, name, public)
values ('fonts', 'fonts', true)
on conflict (id) do nothing;

drop policy if exists "director can upload font files" on storage.objects;
drop policy if exists "staff can upload font files" on storage.objects;
create policy "staff can upload font files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'fonts' and public.current_access_role() in ('director', 'admin', 'staff'));

drop policy if exists "director can delete font files" on storage.objects;
drop policy if exists "uploader or director can delete font files" on storage.objects;
create policy "uploader or director can delete font files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'fonts' and (owner = auth.uid() or public.current_access_role() = 'director'));

drop policy if exists "staff can view font files" on storage.objects;
create policy "staff can view font files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'fonts');

-- ---------------------------------------------------------------------------
-- brushes: the "Kho font & brush" page's second tab — shared digital-painting
-- brush files, tagged by which app they're for (Photoshop .abr, Procreate
-- .brush/.brushset, Clip Studio Paint .sut). Same permission shape as fonts
-- above.
-- ---------------------------------------------------------------------------
create table if not exists public.brushes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'photoshop',
  storage_path text not null,
  file_url text not null,
  file_ext text not null,
  size_bytes integer,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.brushes add column if not exists category text not null default 'photoshop';
alter table public.brushes drop constraint if exists brushes_category_check;
alter table public.brushes add constraint brushes_category_check check (category in ('photoshop', 'procreate', 'clip_studio'));

-- A brush's own file (.abr/.brushset/.sut) can't be rendered by a browser
-- the way a font file can, so there's no automatic stroke preview — this
-- holds a manually-attached swatch image instead, shown in place of the
-- generic icon when set.
alter table public.brushes add column if not exists preview_url text;

alter table public.brushes enable row level security;

drop policy if exists "staff can read brushes" on public.brushes;
create policy "staff can read brushes" on public.brushes for select to authenticated using (true);

drop policy if exists "staff can add brushes" on public.brushes;
create policy "staff can add brushes"
  on public.brushes for insert
  to authenticated
  with check (public.current_access_role() in ('director', 'admin', 'staff'));

drop policy if exists "uploader or director can update brushes" on public.brushes;
create policy "uploader or director can update brushes"
  on public.brushes for update
  to authenticated
  using (uploaded_by = auth.uid() or public.current_access_role() = 'director')
  with check (uploaded_by = auth.uid() or public.current_access_role() = 'director');

drop policy if exists "uploader or director can delete brushes" on public.brushes;
create policy "uploader or director can delete brushes"
  on public.brushes for delete
  to authenticated
  using (uploaded_by = auth.uid() or public.current_access_role() = 'director');

-- 500MB — brush packs (Procreate .brushset especially) commonly exceed the
-- default 50MB project-wide upload limit, so this bucket gets its own cap.
insert into storage.buckets (id, name, public, file_size_limit)
values ('brushes', 'brushes', true, 524288000)
on conflict (id) do update set file_size_limit = 524288000;

drop policy if exists "staff can upload brush files" on storage.objects;
create policy "staff can upload brush files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'brushes' and public.current_access_role() in ('director', 'admin', 'staff'));

drop policy if exists "uploader or director can delete brush files" on storage.objects;
create policy "uploader or director can delete brush files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'brushes' and (owner = auth.uid() or public.current_access_role() = 'director'));

drop policy if exists "staff can view brush files" on storage.objects;
create policy "staff can view brush files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'brushes');

-- ---------------------------------------------------------------------------
-- editor_projects: nhân viên tải file khách gửi lên rồi chèn thêm chữ/ảnh để
-- góp ý/chỉnh sửa trực tiếp trên bản đó ("Biên tập"). Layer (vị trí, kích
-- thước, nội dung) lưu trong jsonb để mở lại sửa tiếp bất kỳ lúc nào.
-- ---------------------------------------------------------------------------
create table if not exists public.editor_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Bản chỉnh sửa mới',
  background_url text,
  background_width integer not null default 1000,
  background_height integer not null default 1000,
  layers jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.editor_projects enable row level security;

drop policy if exists "staff can read editor projects" on public.editor_projects;
create policy "staff can read editor projects" on public.editor_projects for select to authenticated using (true);
drop policy if exists "staff can write editor projects" on public.editor_projects;
create policy "staff can write editor projects" on public.editor_projects for all to authenticated using (true) with check (true);

drop trigger if exists editor_projects_set_updated_at on public.editor_projects;
create trigger editor_projects_set_updated_at
  before update on public.editor_projects
  for each row execute procedure public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('editor-uploads', 'editor-uploads', true)
on conflict (id) do nothing;

drop policy if exists "staff can upload editor files" on storage.objects;
create policy "staff can upload editor files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'editor-uploads');

drop policy if exists "staff can delete editor files" on storage.objects;
create policy "staff can delete editor files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'editor-uploads');

drop policy if exists "staff can view editor files" on storage.objects;
create policy "staff can view editor files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'editor-uploads');

-- ---------------------------------------------------------------------------
-- calendar_events: the shared company calendar (workspace/lich) — every
-- signed-in staff member can read it and add their own events; only the
-- event's creator or the director can edit/delete it.
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  category text not null default 'other' check (category in ('meeting', 'review', 'workshop', 'deadline', 'client', 'off', 'other')),
  start_at timestamptz not null,
  all_day boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Widened to add the 'off' (Nghỉ) category — re-run safe on a table created
-- before that category existed.
alter table public.calendar_events drop constraint if exists calendar_events_category_check;
alter table public.calendar_events add constraint calendar_events_category_check
  check (category in ('meeting', 'review', 'workshop', 'deadline', 'client', 'off', 'other'));

alter table public.calendar_events enable row level security;

drop policy if exists "staff can read calendar events" on public.calendar_events;
create policy "staff can read calendar events"
  on public.calendar_events for select
  to authenticated
  using (true);

drop policy if exists "staff can create calendar events" on public.calendar_events;
create policy "staff can create calendar events"
  on public.calendar_events for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "creator or director can update calendar events" on public.calendar_events;
create policy "creator or director can update calendar events"
  on public.calendar_events for update
  to authenticated
  using (created_by = auth.uid() or public.current_access_role() = 'director')
  with check (created_by = auth.uid() or public.current_access_role() = 'director');

drop policy if exists "creator or director can delete calendar events" on public.calendar_events;
create policy "creator or director can delete calendar events"
  on public.calendar_events for delete
  to authenticated
  using (created_by = auth.uid() or public.current_access_role() = 'director');

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- visitor_conversations / visitor_messages: the "chat with us" widget on the
-- public site — any anonymous visitor can start one, only director/admin
-- can read or reply. Visitors have no Supabase auth session at all, so RLS
-- can't scope rows to "their own" the normal way; instead every policy
-- below denies anon entirely, and the visitor-facing server actions
-- (lib/actions/visitor-chat.ts) go through the service-role client, gating
-- access themselves by requiring the random `visitor_token` issued when the
-- conversation was created (kept client-side in localStorage, never
-- exposed in a URL or to other visitors).
-- ---------------------------------------------------------------------------
create table if not exists public.visitor_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_token uuid not null default gen_random_uuid(),
  visitor_name text,
  status text not null default 'open' check (status in ('open', 'closed')),
  unread boolean not null default true,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.visitor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.visitor_conversations (id) on delete cascade,
  sender_type text not null check (sender_type in ('visitor', 'staff')),
  sender_id uuid references public.profiles (id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.visitor_conversations enable row level security;
alter table public.visitor_messages enable row level security;

drop policy if exists "admin/director can read visitor conversations" on public.visitor_conversations;
create policy "admin/director can read visitor conversations"
  on public.visitor_conversations for select
  to authenticated
  using (public.current_access_role() in ('director', 'admin'));

drop policy if exists "admin/director can update visitor conversations" on public.visitor_conversations;
create policy "admin/director can update visitor conversations"
  on public.visitor_conversations for update
  to authenticated
  using (public.current_access_role() in ('director', 'admin'))
  with check (public.current_access_role() in ('director', 'admin'));

drop policy if exists "admin/director can read visitor messages" on public.visitor_messages;
create policy "admin/director can read visitor messages"
  on public.visitor_messages for select
  to authenticated
  using (public.current_access_role() in ('director', 'admin'));

drop policy if exists "admin/director can send visitor replies" on public.visitor_messages;
create policy "admin/director can send visitor replies"
  on public.visitor_messages for insert
  to authenticated
  with check (
    sender_type = 'staff'
    and sender_id = auth.uid()
    and public.current_access_role() in ('director', 'admin')
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'visitor_messages'
  ) then
    alter publication supabase_realtime add table public.visitor_messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- meeting_channels / meeting_channel_members / meeting_messages: "Họp" — a
-- lightweight Slack-style team chat inside the workspace. One channel is
-- seeded as the always-open "Chung" (general) room every staff member reads
-- without joining; anyone can also spin up their own channel ("phòng ban"),
-- optionally protected by a password, in which case only members who joined
-- with the correct password can read or post in it.
-- ---------------------------------------------------------------------------
create table if not exists public.meeting_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default '💬',
  is_general boolean not null default false,
  password_hash text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Optional sub-room nesting ("phòng nhỏ" for a project's phases, inside a
-- regular room) — one level deep only, enforced app-side (the parent picker
-- only ever offers top-level rooms, and a room that already has a parent
-- doesn't get a "create sub-room" affordance). A sub-room's own membership
-- row set is just a one-time copy of the parent's members at creation time
-- (see createChannel) rather than a live join — simpler than teaching every
-- RLS policy about the hierarchy, and matches the ask: nobody has to be
-- re-invited by hand, but membership isn't meant to stay magically in sync
-- forever after.
alter table public.meeting_channels add column if not exists parent_channel_id uuid references public.meeting_channels (id) on delete cascade;
create index if not exists meeting_channels_parent_idx on public.meeting_channels (parent_channel_id);

create table if not exists public.meeting_channel_members (
  channel_id uuid not null references public.meeting_channels (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);

-- Null until the member actually opens the room for the first time — lets
-- the sidebar flag "you were just added to this room" (e.g. by a director
-- inviting you while you weren't looking) with a dot that clears itself the
-- first time they open it. Stays null for a self-initiated join/create
-- since selectChannel() opens the room immediately in that flow.
alter table public.meeting_channel_members add column if not exists seen_at timestamptz;

create table if not exists public.meeting_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.meeting_channels (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  attachment_url text,
  attachment_filename text,
  attachment_mime text,
  attachment_size integer,
  created_at timestamptz not null default now()
);
create index if not exists meeting_messages_channel_idx
  on public.meeting_messages (channel_id, created_at);

-- Added after the initial table creation — lets a message quote-reply to
-- an earlier one (Zalo/Messenger-style). Set null instead of cascading a
-- delete so replying to a since-deleted message just loses its quote
-- preview rather than being deleted itself.
alter table public.meeting_messages add column if not exists reply_to_message_id uuid references public.meeting_messages (id) on delete set null;

-- Recalling a message ("thu hồi") keeps the row (unlike the hard-delete
-- policy below) so everyone still sees an "Đã thu hồi" placeholder where
-- it was, instead of the message silently vanishing without a trace.
alter table public.meeting_messages add column if not exists is_recalled boolean not null default false;

-- Pinning ("ghim tin nhắn") — non-null pinned_at is what makes a message
-- pinned; pinned_by records who did it (shown in the pinned-messages panel).
-- Any room member can pin/unpin, not just the sender — same collaborative
-- model as reactions, not an ownership thing like recall.
alter table public.meeting_messages add column if not exists pinned_at timestamptz;
alter table public.meeting_messages add column if not exists pinned_by uuid references public.profiles (id) on delete set null;

alter table public.meeting_channels enable row level security;
alter table public.meeting_channel_members enable row level security;
alter table public.meeting_messages enable row level security;

-- Every signed-in staff member can see the channel directory (so they can
-- browse and request to join locked ones), but password_hash never reaches
-- the browser — the list actions in lib/actions/meetings.ts always select
-- named columns instead of `select *`, and only the join action reads
-- password_hash, server-side, to compare it.
drop policy if exists "staff can read channel directory" on public.meeting_channels;
create policy "staff can read channel directory"
  on public.meeting_channels for select
  to authenticated
  using (true);

drop policy if exists "staff can create channels" on public.meeting_channels;
create policy "staff can create channels"
  on public.meeting_channels for insert
  to authenticated
  with check (created_by = auth.uid());

-- A room's own creator (or a director) can always rename/lock it — plus, as
-- a special case, a Project Manager can rename specifically "Chung"
-- (is_general), since that room has no meaningful "creator" for the
-- ordinary rule to apply to.
drop policy if exists "creator or director can update channels" on public.meeting_channels;
create policy "creator, director, or PM (for Chung) can update channels"
  on public.meeting_channels for update
  to authenticated
  using (created_by = auth.uid() or public.current_access_role() = 'director' or (is_general and public.is_director_or_pm()))
  with check (created_by = auth.uid() or public.current_access_role() = 'director' or (is_general and public.is_director_or_pm()));

drop policy if exists "creator or director can delete channels" on public.meeting_channels;
create policy "creator or director can delete channels"
  on public.meeting_channels for delete
  to authenticated
  using (created_by = auth.uid() or public.current_access_role() = 'director');

-- A policy on meeting_channel_members can't check membership by querying
-- meeting_channel_members inline — Postgres re-applies the same policy to
-- that inner query, which references itself again, and so on forever
-- ("infinite recursion detected in policy for relation
-- meeting_channel_members"). A security definer function sidesteps this: it
-- runs as its owner, which bypasses RLS on the table it queries, so the
-- lookup inside it never re-triggers the very policy calling it. Same
-- pattern as can_manage_hr() above.
create or replace function public.is_meeting_channel_member(p_channel_id uuid, p_profile_id uuid default auth.uid())
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.meeting_channel_members m
    where m.channel_id = p_channel_id and m.profile_id = p_profile_id
  );
$$;

-- A member seeing the rest of their own room's roster is what lets
-- createChannel() actually copy a parent room's members into a new
-- sub-room (previously that select only ever returned the caller's own
-- row for a non-director, silently copying nobody else), and is what
-- powers the "add a teammate to this room" picker below.
drop policy if exists "staff can see channel memberships" on public.meeting_channel_members;
create policy "staff can see channel memberships"
  on public.meeting_channel_members for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.current_access_role() = 'director'
    or public.is_meeting_channel_member(channel_id)
  );

drop policy if exists "staff can join channels themselves" on public.meeting_channel_members;
create policy "staff can join channels themselves"
  on public.meeting_channel_members for insert
  to authenticated
  with check (profile_id = auth.uid());

-- Lets an existing member add a teammate directly instead of that person
-- having to find the room in "Khám phá phòng" and (if it's locked) know
-- the password.
drop policy if exists "members can add teammates to the channel" on public.meeting_channel_members;
create policy "members can add teammates to the channel"
  on public.meeting_channel_members for insert
  to authenticated
  with check (public.is_meeting_channel_member(channel_id));

drop policy if exists "member can mark their own membership seen" on public.meeting_channel_members;
create policy "member can mark their own membership seen"
  on public.meeting_channel_members for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- The room creator can also remove *other* people's memberships (the "mời
-- ra" swipe action in the room-info panel) — checked against
-- meeting_channels directly rather than meeting_channel_members, so it
-- doesn't hit the same self-reference recursion the select policy works
-- around above.
drop policy if exists "staff can leave channels themselves" on public.meeting_channel_members;
create policy "staff or room owner can remove memberships"
  on public.meeting_channel_members for delete
  to authenticated
  using (
    profile_id = auth.uid()
    or public.current_access_role() = 'director'
    or exists (
      select 1 from public.meeting_channels c
      where c.id = meeting_channel_members.channel_id and c.created_by = auth.uid()
    )
  );

drop policy if exists "channel members can read messages" on public.meeting_messages;
create policy "channel members can read messages"
  on public.meeting_messages for select
  to authenticated
  using (
    exists (select 1 from public.meeting_channels c where c.id = meeting_messages.channel_id and c.is_general)
    or exists (
      select 1 from public.meeting_channel_members m
      where m.channel_id = meeting_messages.channel_id and m.profile_id = auth.uid()
    )
    or public.current_access_role() = 'director'
  );

drop policy if exists "channel members can send messages" on public.meeting_messages;
create policy "channel members can send messages"
  on public.meeting_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      exists (select 1 from public.meeting_channels c where c.id = meeting_messages.channel_id and c.is_general)
      or exists (
        select 1 from public.meeting_channel_members m
        where m.channel_id = meeting_messages.channel_id and m.profile_id = auth.uid()
      )
    )
  );

drop policy if exists "sender or director can delete messages" on public.meeting_messages;
create policy "sender or director can delete messages"
  on public.meeting_messages for delete
  to authenticated
  using (sender_id = auth.uid() or public.current_access_role() = 'director');

drop policy if exists "sender can recall their own messages" on public.meeting_messages;
create policy "sender can recall their own messages"
  on public.meeting_messages for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- Separate (permissive) policy for pinning — any room member can pin/unpin
-- any message, not just their own. The server action is the actual gate on
-- which columns an update touches (togglePinMessage only ever sets
-- pinned_at/pinned_by); this policy just grants row access.
drop policy if exists "channel members can pin messages" on public.meeting_messages;
create policy "channel members can pin messages"
  on public.meeting_messages for update
  to authenticated
  using (
    exists (
      select 1 from public.meeting_channels c
      where c.id = meeting_messages.channel_id
        and (
          c.is_general
          or exists (
            select 1 from public.meeting_channel_members m
            where m.channel_id = c.id and m.profile_id = auth.uid()
          )
        )
    )
    or public.current_access_role() = 'director'
  )
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meeting_messages'
  ) then
    alter publication supabase_realtime add table public.meeting_messages;
  end if;
end $$;

-- meeting_message_reactions: quick emoji reactions on a Họp message —
-- one row per (message, person, emoji), toggled on/off from the client.
create table if not exists public.meeting_message_reactions (
  message_id uuid not null references public.meeting_messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);

alter table public.meeting_message_reactions enable row level security;

drop policy if exists "channel members can read reactions" on public.meeting_message_reactions;
create policy "channel members can read reactions"
  on public.meeting_message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.meeting_messages msg
      join public.meeting_channels c on c.id = msg.channel_id
      where msg.id = meeting_message_reactions.message_id
        and (
          c.is_general
          or exists (
            select 1 from public.meeting_channel_members m
            where m.channel_id = c.id and m.profile_id = auth.uid()
          )
        )
    )
    or public.current_access_role() = 'director'
  );

drop policy if exists "staff can react as themselves" on public.meeting_message_reactions;
create policy "staff can react as themselves"
  on public.meeting_message_reactions for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "staff can remove their own reaction" on public.meeting_message_reactions;
create policy "staff can remove their own reaction"
  on public.meeting_message_reactions for delete
  to authenticated
  using (profile_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meeting_message_reactions'
  ) then
    alter publication supabase_realtime add table public.meeting_message_reactions;
  end if;
end $$;

-- meeting_channel_reads: "seen up to here" marker, one row per (channel,
-- person) — powers the small avatar shown under the last message each
-- member has read, Messenger-style. Read broadly (everyone in a channel
-- needs to see everyone else's read position, unlike a 1:1 DM), but each
-- person can only ever write their own row.
create table if not exists public.meeting_channel_reads (
  channel_id uuid not null references public.meeting_channels (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_message_id uuid references public.meeting_messages (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);

alter table public.meeting_channel_reads enable row level security;

drop policy if exists "staff can read channel read receipts" on public.meeting_channel_reads;
create policy "staff can read channel read receipts"
  on public.meeting_channel_reads for select
  to authenticated
  using (true);

drop policy if exists "staff can mark their own read receipt" on public.meeting_channel_reads;
create policy "staff can mark their own read receipt"
  on public.meeting_channel_reads for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "staff can update their own read receipt" on public.meeting_channel_reads;
create policy "staff can update their own read receipt"
  on public.meeting_channel_reads for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meeting_channel_reads'
  ) then
    alter publication supabase_realtime add table public.meeting_channel_reads;
  end if;
end $$;

-- Seed the always-open "Chung" channel once, so every workspace has a
-- default room without requiring a director to create one manually.
insert into public.meeting_channels (name, icon, is_general)
select 'Chung', '💬', true
where not exists (select 1 from public.meeting_channels where is_general);

-- ---------------------------------------------------------------------------
-- invoices: internal invoice/quote generator (quan-tri/hoa-don), director
-- only. This is a document-generation tool, not a government-compliant
-- e-invoice (Thông tư 78) — it doesn't file anything with the tax
-- authority, it just produces a professional PDF (via browser print) and
-- keeps a history. Line items are stored as jsonb since they're always
-- read/written as a whole with the invoice, never queried individually.
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  client_name text not null,
  client_address text,
  client_tax_code text,
  client_email text,
  issue_date date not null default current_date,
  due_date date,
  items jsonb not null default '[]'::jsonb,
  tax_rate numeric not null default 0,
  note text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices enable row level security;

drop policy if exists "director can manage invoices" on public.invoices;
drop policy if exists "director or pm can manage invoices" on public.invoices;
create policy "director or pm can manage invoices"
  on public.invoices for all
  to authenticated
  using (public.can_manage_hr())
  with check (public.can_manage_hr());

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workspace_room_labels: tiny key/value store for renaming pseudo-rooms in
-- Trò chuyện & họp that don't have their own table row to rename — right
-- now just the "Riêng" (1:1 DM) tab, which is a hardcoded label rather than
-- a real meeting_channels row. "Chung" doesn't need an entry here since
-- it's renamed in place via meeting_channels.name instead.
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_room_labels (
  key text primary key,
  label text not null,
  updated_at timestamptz not null default now()
);

alter table public.workspace_room_labels enable row level security;

drop policy if exists "staff can read workspace room labels" on public.workspace_room_labels;
create policy "staff can read workspace room labels"
  on public.workspace_room_labels for select
  to authenticated
  using (true);

drop policy if exists "director or PM can write workspace room labels" on public.workspace_room_labels;
create policy "director or PM can write workspace room labels"
  on public.workspace_room_labels for all
  to authenticated
  using (public.is_director_or_pm())
  with check (public.is_director_or_pm());

-- ---------------------------------------------------------------------------
-- board_labels: custom, per-board Kanban labels (Trello-style) — a color plus
-- an editable name, e.g. "GẤP", "Dự án GIÁ OK, nên đầu tư". tasks.labels
-- stores an array of these ids (as text), replacing the old fixed 8-color
-- palette keys that nothing had ever actually been set to.
-- ---------------------------------------------------------------------------
create table if not exists public.board_labels (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null default '',
  color text not null default '#78776F',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists board_labels_board_id_idx on public.board_labels (board_id);

alter table public.board_labels enable row level security;

drop policy if exists "staff can read board labels" on public.board_labels;
create policy "staff can read board labels"
  on public.board_labels for select
  to authenticated
  using (true);

drop policy if exists "staff can write board labels" on public.board_labels;
create policy "staff can write board labels"
  on public.board_labels for all
  to authenticated
  using (true)
  with check (true);

-- Seed the real board with the same labels already in use on the studio's
-- Trello board, so the migrated cards have something to pick from right
-- away. Safe to re-run — skipped once the (first) board already has labels.
insert into public.board_labels (board_id, name, color, position)
select b.id, v.name, v.color, v.position
from public.boards b
cross join (values
  ('Dự án GIÁ OK, nên đầu tư', '#3F9E52', 0),
  ('Bài TEST cho khách', '#D6A400', 1),
  ('Dự án giá THẤP, cần làm', '#FF7A3D', 2),
  ('GẤP', '#E5484D', 3),
  ('KH Series', '#4F80D9', 4),
  ('Dự án theo GIỜ', '#3B98BE', 5),
  ('Pause', '#78776F', 6)
) as v(name, color, position)
where b.id = (select id from public.boards order by created_at asc limit 1)
  and not exists (select 1 from public.board_labels where board_id = b.id);

-- ---------------------------------------------------------------------------
-- Seed the portfolio with the placeholder projects already on the public
-- site, so /du-an is backed by real rows from the start. Safe to re-run —
-- skipped once any project exists.
-- ---------------------------------------------------------------------------
insert into public.projects (title, tag, cover_image_url, position)
select * from (values
  ('Miền Dâu Dại', 'Sách tranh', '/placeholders/projects/mien-dau-dai.jpg', 0),
  ('Drachen lieben Schokolade', 'Sách truyện', '/placeholders/projects/drachen-schokolade.jpg', 1),
  ('Usborne First Experiences', 'Sách giáo dục', '/placeholders/projects/usborne-first-experiences.jpg', 2),
  ('Ping the Panda', 'Sách tranh', '/placeholders/projects/ping-the-panda.jpg', 3),
  ('The Mystical Amulet', 'Sách truyện', '/placeholders/projects/mystical-amulet.jpg', 4),
  ('Hành trình của Gấu Bông', 'Character Design', '/placeholders/projects/hanh-trinh-gau-bong.jpg', 5),
  ('Bộ sticker – Thế giới Funti', 'Product & Merch', '/placeholders/projects/bo-sticker-funti.jpg', 6),
  ('Mô hình 3D – Gấu Bông', '3D & Mô hình', '/placeholders/projects/mo-hinh-3d-gau-bong.jpg', 7),
  ('Sách toán vui mỗi ngày', 'Sách giáo dục', '/placeholders/projects/sach-toan-vui.jpg', 8)
) as seed(title, tag, cover_image_url, position)
where not exists (select 1 from public.projects);
