-- Lets a quán be added with just a screenshotted menu photo (menu typed
-- in later) instead of always requiring items up front. Run once in the
-- Supabase Dashboard SQL Editor.

alter table public.food_shops add column if not exists photo_url text;
