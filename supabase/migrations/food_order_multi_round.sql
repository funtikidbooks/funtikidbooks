-- Lets a channel have several separate food order rounds the same day
-- (lunch, then a separate afternoon trà sữa round) instead of just one.
-- Run once in the Supabase Dashboard SQL Editor.

alter table public.food_order_rounds drop constraint if exists food_order_rounds_channel_id_order_date_key;
