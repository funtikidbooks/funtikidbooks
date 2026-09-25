-- Run once in the Supabase Dashboard SQL Editor.
-- The Upwork client-evaluation SOP (tab "SOP" on /quan-tri/upwork), kept
-- as one structured JSON document per id — the page renders it with the
-- slide deck's layout and saves the whole document on each edit. Until a
-- row exists the page shows the built-in copy of the original deck
-- (src/lib/upworkSop.ts). Director/PM only, same as the rest of the page.

create table if not exists public.upwork_sop (
  id text primary key default 'default',
  content jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.upwork_sop enable row level security;

drop policy if exists "director or pm can read upwork sop" on public.upwork_sop;
create policy "director or pm can read upwork sop" on public.upwork_sop
  for select to authenticated using (public.is_director_or_pm());
drop policy if exists "director or pm can write upwork sop" on public.upwork_sop;
create policy "director or pm can write upwork sop" on public.upwork_sop
  for all to authenticated using (public.is_director_or_pm()) with check (public.is_director_or_pm());
