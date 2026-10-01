-- "Trưa nay ăn gì?" as a wall of dishes (like truanayangi.com, minus the
-- game): each món has a category, a vegetarian flag and a photo. Photos
-- start as free Unsplash illustrations (photo_is_sample — shown with a
-- small "Ảnh minh hoạ" tag) until someone who ordered it uploads a real
-- one. Seeds the signature món of each quán added in food_shop_details.sql
-- (prices left empty where Foody doesn't show them — "giá tại quán").
-- Run once in the Supabase Dashboard SQL Editor, after food_shop_details.sql.

alter table public.food_shop_menu_items
  add column if not exists category text,
  add column if not exists vegetarian boolean not null default false,
  add column if not exists photo_url text,
  add column if not exists photo_is_sample boolean not null default false;

-- Signature món per quán, only for quán that have no menu yet.
insert into public.food_shop_menu_items (shop_id, name, price, category, photo_url, photo_is_sample, sort_order)
select s.id, v.dish, null, v.category, 'https://images.unsplash.com/photo-' || v.photo || '?w=800&q=70&auto=format&fit=crop', true, v.ord
from public.food_shops s
join (values
  ('Cơm Tấm Thuận Kiều - Út Tịch', 'Cơm tấm sườn nướng', 'com', '1762305193367-91e072e47c3f', 1),
  ('Cơm Tấm Thuận Kiều - Út Tịch', 'Cơm sườn bì chả trứng', 'com', '1762305193367-91e072e47c3f', 2),
  ('Cơm Gà Mắm Tỏi 198', 'Cơm gà mắm tỏi', 'com', '1426869981800-95ebf51ce900', 1),
  ('Cơm Gà, Mẹt Gà, Gỏi - Gà Ta Ngon Số 1', 'Cơm gà ta', 'com', '1787329682500-04fa551dde92', 1),
  ('Cơm Gà, Mẹt Gà, Gỏi - Gà Ta Ngon Số 1', 'Gỏi gà', 'ga', '1605291535065-e1d52d2b264a', 2),
  ('Mướt - Cháo Sườn Quẩy Giòn', 'Cháo sườn quẩy giòn', 'nuoc', '1766761562530-c8dd12c96d9a', 1),
  ('Bún Mắm & Lẩu Mắm Cô Út', 'Bún mắm', 'nuoc', '1745817078506-bfc70df458b5', 1),
  ('Bún Mắm & Lẩu Mắm Cô Út', 'Lẩu mắm', 'nuoc', '1697862477275-488cfb5e7570', 2),
  ('Cơm Niêu Đệ Nhất', 'Cơm niêu', 'com', '1777613112982-a5478f5741aa', 1),
  ('Hội An Quán - Hoàng Văn Thụ', 'Món Hội An', 'nuoc', '1583316175701-0bc5f25a0a44', 1),
  ('Bún Riêu Cua - Nguyễn Bặc', 'Bún riêu cua', 'nuoc', '1571809839227-b2ac3d261257', 1),
  ('Bún Bò - Nguyễn Thanh Tuyền', 'Bún bò', 'nuoc', '1597345637412-9fd611e758f3', 1),
  ('Wego Coffee - Út Tịch', 'Cà phê sữa đá', 'uong', '1471922597728-92f81bfe2445', 1),
  ('The Coffee House - Út Tịch', 'Cà phê sữa đá', 'uong', '1461023058943-07fcbe16d735', 1),
  ('The Coffee House - Út Tịch', 'Trà trái cây', 'uong', '1597481499666-130f8eb2c9cd', 2)
) as v(shop, dish, category, photo, ord) on v.shop = s.name
where not exists (select 1 from public.food_shop_menu_items i where i.shop_id = s.id);

-- Phở 193's menu (already there): phở dishes get the category and a sample photo.
update public.food_shop_menu_items i
set category = 'nuoc',
    photo_url = 'https://images.unsplash.com/photo-1766050586763-723571af4dde?w=800&q=70&auto=format&fit=crop',
    photo_is_sample = true
from public.food_shops s
where i.shop_id = s.id and s.name = 'Phở 193 - Nguyễn Phúc Nguyên' and i.name ilike 'phở%' and i.photo_url is null;
