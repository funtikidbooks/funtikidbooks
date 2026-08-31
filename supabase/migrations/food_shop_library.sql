-- Adds the "Thư viện quán ăn" for the Đặt đồ ăn room: a reusable menu per
-- quán (added once, either typed by hand or read off a real ShopeeFood
-- page), so starting an order round can just point at a saved shop and
-- everyone ticks items instead of free-typing. Also seeds "Phở 193 -
-- Nguyễn Phúc Nguyên" with its real ShopeeFood menu, read by hand.
-- Run once in the Supabase Dashboard SQL Editor — after food_order_room.sql.

create table if not exists public.food_shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shopee_link text,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.food_shops enable row level security;

drop policy if exists "staff can read food shops" on public.food_shops;
create policy "staff can read food shops"
  on public.food_shops for select
  to authenticated
  using (true);

drop policy if exists "staff can add food shops" on public.food_shops;
create policy "staff can add food shops"
  on public.food_shops for insert
  to authenticated
  with check (added_by = auth.uid());

drop policy if exists "creator or director can delete food shops" on public.food_shops;
create policy "creator or director can delete food shops"
  on public.food_shops for delete
  to authenticated
  using (added_by = auth.uid() or public.current_access_role() = 'director');

create table if not exists public.food_shop_menu_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.food_shops (id) on delete cascade,
  name text not null,
  note text,
  price numeric,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists food_shop_menu_items_shop_idx on public.food_shop_menu_items (shop_id);

alter table public.food_shop_menu_items enable row level security;

drop policy if exists "staff can read food shop menu items" on public.food_shop_menu_items;
create policy "staff can read food shop menu items"
  on public.food_shop_menu_items for select
  to authenticated
  using (true);

drop policy if exists "staff can manage food shop menu items" on public.food_shop_menu_items;
create policy "staff can manage food shop menu items"
  on public.food_shop_menu_items for all
  to authenticated
  using (true)
  with check (true);

alter table public.food_order_rounds add column if not exists shop_id uuid references public.food_shops (id) on delete set null;

-- Seed "Phở 193 - Nguyễn Phúc Nguyên".
insert into public.food_shops (name, shopee_link)
select 'Phở 193 - Nguyễn Phúc Nguyên', 'https://shopeefood.vn/ho-chi-minh/pho-193-nguyen-phuc-nguyen'
where not exists (select 1 from public.food_shops where name = 'Phở 193 - Nguyễn Phúc Nguyên');

insert into public.food_shop_menu_items (shop_id, name, note, price, sort_order)
select s.id, v.name, v.note, v.price, v.sort_order
from public.food_shops s
join (values
  ('Phở tái', 'Đã có tô nhựa', 40000, 1),
  ('Phở thập cẩm', 'Đã có tô nhựa', 50000, 2),
  ('Phở gân', 'Đã có tô nhựa', 40000, 3),
  ('Phở nạm', 'Đã có tô muỗng nhựa', 40000, 4),
  ('Phở bò viên', 'Đã có tô nhựa', 40000, 5),
  ('Chén Trứng', '1 trứng là say đắm 2 trứng là đắm say', 10000, 6)
) as v(name, note, price, sort_order) on true
where s.name = 'Phở 193 - Nguyễn Phúc Nguyên'
  and not exists (select 1 from public.food_shop_menu_items where shop_id = s.id);
