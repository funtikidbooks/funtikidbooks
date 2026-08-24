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
-- attendance: simple day-by-day presence log, director-managed
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

alter table public.attendance enable row level security;

drop policy if exists "staff can read attendance" on public.attendance;
create policy "staff can read attendance"
  on public.attendance for select
  to authenticated
  using (true);

drop policy if exists "director can write attendance" on public.attendance;
create policy "director can write attendance"
  on public.attendance for all
  to authenticated
  using (public.current_access_role() = 'director')
  with check (public.current_access_role() = 'director');

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
-- fonts: the workspace's shared font library ("Kho font"). Director uploads
-- typeface files staff can browse/preview/download from inside the app.
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
create policy "director can add fonts"
  on public.fonts for insert
  to authenticated
  with check (public.current_access_role() = 'director');

drop policy if exists "director can delete fonts" on public.fonts;
create policy "director can delete fonts"
  on public.fonts for delete
  to authenticated
  using (public.current_access_role() = 'director');

insert into storage.buckets (id, name, public)
values ('fonts', 'fonts', true)
on conflict (id) do nothing;

drop policy if exists "director can upload font files" on storage.objects;
create policy "director can upload font files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'fonts' and public.current_access_role() = 'director');

drop policy if exists "director can delete font files" on storage.objects;
create policy "director can delete font files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'fonts' and public.current_access_role() = 'director');

drop policy if exists "staff can view font files" on storage.objects;
create policy "staff can view font files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'fonts');

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
