-- Run once in the Supabase Dashboard SQL Editor.
-- 1) Proposal templates for the "Tìm khách (Upwork)" page under /quan-tri —
--    director/PM keep several ready-made proposals (per kind of job) there,
--    copy them when applying, and the overnight search run reads them to
--    draft proposals. Same director/PM-only access as upwork_leads.
-- 2) mindmap_nodes.link_url — lets a mindmap branch point somewhere
--    (e.g. "Mẫu proposal + portfolio" → the template library) with an
--    "Mở →" button, instead of pasting the content into its note.

create table if not exists public.upwork_proposal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  job_type text,
  content text not null,
  sort_order int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.upwork_proposal_templates enable row level security;

drop policy if exists "director or pm can read proposal templates" on public.upwork_proposal_templates;
create policy "director or pm can read proposal templates" on public.upwork_proposal_templates
  for select to authenticated using (public.is_director_or_pm());
drop policy if exists "director or pm can write proposal templates" on public.upwork_proposal_templates;
create policy "director or pm can write proposal templates" on public.upwork_proposal_templates
  for all to authenticated using (public.is_director_or_pm()) with check (public.is_director_or_pm());

drop trigger if exists upwork_proposal_templates_set_updated_at on public.upwork_proposal_templates;
create trigger upwork_proposal_templates_set_updated_at
  before update on public.upwork_proposal_templates
  for each row execute procedure public.set_updated_at();

alter table public.mindmap_nodes add column if not exists link_url text;
