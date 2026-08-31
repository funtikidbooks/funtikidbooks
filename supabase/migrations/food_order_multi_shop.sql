-- Lets a food order round pull its checklist from several quán at once
-- (cơm from one place, trà sữa from another) instead of just one. Run once
-- in the Supabase Dashboard SQL Editor — after food_shop_library.sql.

create table if not exists public.food_order_round_shops (
  round_id uuid not null references public.food_order_rounds (id) on delete cascade,
  shop_id uuid not null references public.food_shops (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (round_id, shop_id)
);

alter table public.food_order_round_shops enable row level security;

drop policy if exists "staff can read food order round shops" on public.food_order_round_shops;
create policy "staff can read food order round shops"
  on public.food_order_round_shops for select
  to authenticated
  using (true);

drop policy if exists "staff can manage food order round shops" on public.food_order_round_shops;
create policy "staff can manage food order round shops"
  on public.food_order_round_shops for all
  to authenticated
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'food_order_round_shops'
  ) then
    alter publication supabase_realtime add table public.food_order_round_shops;
  end if;
end $$;
