-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.
--
-- Khách hàng and nhân viên are separate accounts. A client signs in on
-- /cong-viec with a magic link tagged signup_source = 'client'
-- (GuestChatPanel.tsx), but handle_new_user() still made every new login a
-- staff `profiles` row — so a client showed up in Nhân sự / Thành viên /
-- Thử việc and could even open /workspace until the portal happened to
-- clean it up. Clients now live only in public.clients (Quản trị → Tài
-- khoản khách hàng).

-- 1) New client sign-ups no longer get a staff profile. (Since
--    salary_privacy.sql, 2/11/2026, no sign-up does — the "client" tag was
--    the sign-up's own say-so — and staff profiles come from
--    createStaffAccount. Kept identical here so re-running this file can't
--    bring the old behaviour back.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  return new;
end;
$$;

-- 2) sếp Phúc's client test account, made on the Công việc page.
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"signup_source": "client"}'::jsonb
where email = 'thewolfstudio2017@gmail.com';

-- 3) Remove the staff rows that were auto-created for client accounts.
--    Never touches a director/admin, anyone with a chức danh, or anyone who
--    has ever written in staff chat. Lists what it removed.
delete from public.profiles p
using auth.users u
where u.id = p.id
  and u.raw_user_meta_data ->> 'signup_source' = 'client'
  and p.access_role = 'staff'
  and p.role is null
  and not exists (select 1 from public.meeting_messages m where m.sender_id = p.id)
  and not exists (select 1 from public.direct_messages d where d.sender_id = p.id or d.recipient_id = p.id)
returning p.email, p.display_name;
