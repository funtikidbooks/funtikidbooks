-- Run once in the Supabase Dashboard SQL Editor.
-- Backs the "Tìm khách (Upwork)" report page under /quan-tri — each night
-- an automated search-and-draft run (not built yet, see chat for context)
-- writes one upwork_batches row plus one upwork_leads row per matching job
-- it found, with a drafted (unsent) proposal. Director/PM read it in the
-- morning and approve or reject each lead by hand; nothing here ever sends
-- anything to Upwork on its own.

create table if not exists public.upwork_batches (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  jobs_found int not null default 0,
  leads_drafted int not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.upwork_leads (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.upwork_batches (id) on delete cascade,
  job_title text not null,
  job_url text not null,
  budget_text text,
  client_info text,
  match_reason text,
  proposal_draft text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'sent')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists upwork_leads_batch_id_idx on public.upwork_leads (batch_id);

alter table public.upwork_batches enable row level security;
alter table public.upwork_leads enable row level security;

-- Director or exact chức danh "Project Manager" only — see
-- public.is_director_or_pm() in supabase/schema.sql. Writes normally come
-- from the overnight job via the service-role key (bypasses RLS), these
-- policies are what gates the browser-side reads/approvals.
drop policy if exists "director or pm can read upwork batches" on public.upwork_batches;
create policy "director or pm can read upwork batches" on public.upwork_batches
  for select to authenticated using (public.is_director_or_pm());
drop policy if exists "director or pm can write upwork batches" on public.upwork_batches;
create policy "director or pm can write upwork batches" on public.upwork_batches
  for all to authenticated using (public.is_director_or_pm()) with check (public.is_director_or_pm());

drop policy if exists "director or pm can read upwork leads" on public.upwork_leads;
create policy "director or pm can read upwork leads" on public.upwork_leads
  for select to authenticated using (public.is_director_or_pm());
drop policy if exists "director or pm can write upwork leads" on public.upwork_leads;
create policy "director or pm can write upwork leads" on public.upwork_leads
  for all to authenticated using (public.is_director_or_pm()) with check (public.is_director_or_pm());

drop trigger if exists upwork_leads_set_updated_at on public.upwork_leads;
create trigger upwork_leads_set_updated_at
  before update on public.upwork_leads
  for each row execute procedure public.set_updated_at();

-- Realtime so an approve/reject click from one of director/PM shows up
-- live for the other, same pattern as mindmap_nodes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'upwork_leads'
  ) then
    alter publication supabase_realtime add table public.upwork_leads;
  end if;
end $$;
