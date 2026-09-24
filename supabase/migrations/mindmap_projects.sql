-- Run once in the Supabase Dashboard SQL Editor.
-- Backs the "Dự án" workspace section (src/app/workspace/du-an) — a
-- freeform, drag-to-position mindmap per internal project, branches
-- connected parent → child by mindmap_nodes.parent_id (position is free,
-- the connection itself is a tree, same "tẻ nhánh" shape as NotebookLM's
-- mindmap). A node can optionally link to a draft (unpublished) news_posts
-- row so a blog post can be dropped into the map for review before
-- publishing, instead of going live unreviewed.

create table if not exists public.mindmap_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  color text not null default '#FF7A3D',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mindmap_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mindmap_projects (id) on delete cascade,
  parent_id uuid references public.mindmap_nodes (id) on delete cascade,
  title text not null,
  note text,
  x double precision not null default 0,
  y double precision not null default 0,
  color text,
  linked_news_post_id uuid references public.news_posts (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mindmap_nodes_project_id_idx on public.mindmap_nodes (project_id);
create index if not exists mindmap_nodes_parent_id_idx on public.mindmap_nodes (parent_id);

alter table public.mindmap_projects enable row level security;
alter table public.mindmap_nodes enable row level security;

-- Internal studio tool — same "any signed-in staff can see/edit everything"
-- policy shape already used for boards/board_columns/tasks above. Draft
-- blog-post CONTENT stays gated by news_posts' own RLS (director/admin
-- only for unpublished rows) regardless of who can see the mindmap node
-- that links to it — a non-director staff member just sees the node
-- without the draft preview.
drop policy if exists "staff can read mindmap projects" on public.mindmap_projects;
create policy "staff can read mindmap projects" on public.mindmap_projects for select to authenticated using (true);
drop policy if exists "staff can write mindmap projects" on public.mindmap_projects;
create policy "staff can write mindmap projects" on public.mindmap_projects for all to authenticated using (true) with check (true);

drop policy if exists "staff can read mindmap nodes" on public.mindmap_nodes;
create policy "staff can read mindmap nodes" on public.mindmap_nodes for select to authenticated using (true);
drop policy if exists "staff can write mindmap nodes" on public.mindmap_nodes;
create policy "staff can write mindmap nodes" on public.mindmap_nodes for all to authenticated using (true) with check (true);

drop trigger if exists mindmap_projects_set_updated_at on public.mindmap_projects;
create trigger mindmap_projects_set_updated_at
  before update on public.mindmap_projects
  for each row execute procedure public.set_updated_at();

drop trigger if exists mindmap_nodes_set_updated_at on public.mindmap_nodes;
create trigger mindmap_nodes_set_updated_at
  before update on public.mindmap_nodes
  for each row execute procedure public.set_updated_at();

-- Realtime so two staff editing the same map at once (dragging, adding
-- branches) see each other's changes live, same as the Kanban board above.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mindmap_nodes'
  ) then
    alter publication supabase_realtime add table public.mindmap_nodes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mindmap_projects'
  ) then
    alter publication supabase_realtime add table public.mindmap_projects;
  end if;
end $$;
