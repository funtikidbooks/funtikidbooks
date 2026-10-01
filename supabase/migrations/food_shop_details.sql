-- "Trưa nay ăn gì?" in the Đặt đồ ăn room: pick a quán by topic and by
-- requirement (budget, near the office, open now, has vegetarian, can be
-- delivered…), then see its address on the map and call it. The quán
-- library (food_shops) gets the details to filter and act on, anyone in
-- the studio can fill them in, and it starts with the quán on and around
-- Út Tịch found on Foody (address, hours, price where shown). Phone numbers
-- aren't published there — add each one the first time someone calls.
-- Run once in the Supabase Dashboard SQL Editor.

alter table public.food_shops
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists map_url text,
  add column if not exists themes text[] not null default '{}',
  add column if not exists opening_hours text,
  add column if not exists price_min integer,
  add column if not exists price_max integer,
  add column if not exists near_office boolean not null default false,
  add column if not exists dine_in boolean not null default false,
  add column if not exists vegetarian boolean not null default false,
  add column if not exists note text,
  add column if not exists updated_at timestamptz;

-- Anyone in the studio keeps the library up to date (address, phone…),
-- like the menus already are.
drop policy if exists "staff can update food shops" on public.food_shops;
create policy "staff can update food shops"
  on public.food_shops for update
  to authenticated
  using (true)
  with check (true);

-- The quán found around the office (Foody, 1/10/2026).
insert into public.food_shops (name, address, themes, opening_hours, price_min, price_max, near_office, dine_in)
select v.name, v.address, v.themes, v.hours, v.pmin, v.pmax, v.near, v.dine
from (values
  ('Cơm Tấm Thuận Kiều - Út Tịch', '17 Út Tịch, P. 4, Q. Tân Bình, TP. HCM', array['com'], '10:00 - 23:00', 25000, 165000, true, true),
  ('Cơm Gà Mắm Tỏi 198', '31 Út Tịch, P. 4, Q. Tân Bình, TP. HCM', array['com', 'ga'], null, null, null, true, true),
  ('Cơm Gà, Mẹt Gà, Gỏi - Gà Ta Ngon Số 1', '72 Út Tịch, P. 4, Q. Tân Bình, TP. HCM', array['com', 'ga'], null, null, null, true, true),
  ('Mướt - Cháo Sườn Quẩy Giòn', '48/3 Út Tịch, P. 4, Q. Tân Bình, TP. HCM', array['nuoc'], '08:00 - 20:30', null, null, true, true),
  ('Bún Mắm & Lẩu Mắm Cô Út', '74 Út Tịch, P. 4, Q. Tân Bình, TP. HCM', array['nuoc'], '07:00 - 22:00', null, null, true, true),
  ('Cơm Niêu Đệ Nhất', '14-16 Hoàng Việt, P. 4, Q. Tân Bình, TP. HCM', array['com'], null, null, null, false, true),
  ('Hội An Quán - Hoàng Văn Thụ', '308/26 Hoàng Văn Thụ, P. 4, Q. Tân Bình, TP. HCM', array['com', 'nuoc'], null, null, null, false, true),
  ('Bún Riêu Cua - Nguyễn Bặc', '71/26 Nguyễn Bặc, P. 3, Q. Tân Bình, TP. HCM', array['nuoc'], null, null, null, false, true),
  ('Bún Bò - Nguyễn Thanh Tuyền', '61 Nguyễn Thanh Tuyền, Q. Tân Bình, TP. HCM', array['nuoc'], null, null, null, false, true),
  ('Wego Coffee - Út Tịch', '64 Út Tịch, P. 4, Q. Tân Bình, TP. HCM', array['uong'], null, null, null, true, true),
  ('The Coffee House - Út Tịch', '17B Út Tịch, Q. Tân Bình, TP. HCM', array['uong'], null, null, null, true, true)
) as v(name, address, themes, hours, pmin, pmax, near, dine)
where not exists (select 1 from public.food_shops s where s.name = v.name);

-- The phở already in the library is a noodle-soup place, delivered.
update public.food_shops set themes = array['nuoc'] where name = 'Phở 193 - Nguyễn Phúc Nguyên' and themes = '{}';
