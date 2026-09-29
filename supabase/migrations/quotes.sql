-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.
-- Báo giá (Quản trị → Khách hàng → Báo giá): quotes the director writes
-- for clients — 1 to 3 price tiers, optional extras (a test piece, first
-- page, first book + later books), terms — printed to PDF or copied as a
-- message. Director only; nothing here is ever public.

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null default '',
  client_name text not null default '',
  client_contact text not null default '',
  language text not null default 'vi' check (language in ('vi', 'en')),
  currency text not null default 'VND' check (currency in ('VND', 'USD')),
  tier_names text[] not null default array['Cơ bản', 'Chi tiết cao', 'Rất chi tiết'],
  tier_notes text[] not null default '{}',
  intro text not null default '',
  items jsonb not null default '[]'::jsonb,
  terms text not null default '',
  valid_days integer not null default 14 check (valid_days between 1 and 365),
  prepared_by text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quotes_created_at_idx on public.quotes (created_at desc);

alter table public.quotes enable row level security;

drop policy if exists "director or pm manage quotes" on public.quotes;
drop policy if exists "director manages quotes" on public.quotes;
create policy "director manages quotes" on public.quotes
  for all to authenticated
  using (public.current_access_role() = 'director')
  with check (public.current_access_role() = 'director');

-- Added 2026-09-29: khổ sách on the quote ("21 × 21 cm", "8.5 × 8.5 in").
alter table public.quotes add column if not exists book_size text not null default '';

-- Added 2026-09-29: các đợt thanh toán — [{ id, label, percent }], each a
-- share of the total of the tier the client picks; amounts are computed.
alter table public.quotes add column if not exists payments jsonb not null default '[]'::jsonb;
