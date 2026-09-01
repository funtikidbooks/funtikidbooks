-- Adds a saved VietQR screenshot per staff member, so paying is a literal
-- scan instead of retyping the account number. Run once in the Supabase
-- Dashboard SQL Editor.

alter table public.staff_bank_info add column if not exists qr_image_url text;
