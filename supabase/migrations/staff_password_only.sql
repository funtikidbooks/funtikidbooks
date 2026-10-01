-- Nhân sự chỉ đăng nhập bằng mật khẩu (sếp Phúc, 1/10).
-- The Công việc portal emails clients a sign-in link — and Supabase would
-- send one to ANY address, so typing funtikidbooks@gmail.com (or any staff
-- email) there opened that staff account, the director's included, with
-- no password. The page now refuses staff emails, but the real lock has
-- to be here, where tokens are issued: this hook refuses a staff account
-- (anyone with a public.profiles row — clients have none) whenever the
-- sign-in came from an emailed link or code, or from Google (oauth). Password sign-in, and keeping
-- an existing password session alive, are untouched.
--
-- Run once in the Supabase Dashboard SQL Editor, THEN switch it on:
--   Authentication → Hooks → Add hook → "Customize Access Token (JWT) Claims"
--   → Postgres → schema public → function staff_password_only_hook → Create.

create or replace function public.staff_password_only_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  method text := coalesce(event ->> 'authentication_method', '');
begin
  if method in ('magiclink', 'otp', 'recovery', 'invite', 'email/signup', 'oauth', 'sso/saml')
     and exists (select 1 from public.profiles where id = (event ->> 'user_id')::uuid) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Tài khoản nhân sự Funti chỉ đăng nhập bằng mật khẩu tại funtikidbooks.com/dang-nhap.'
      )
    );
  end if;
  return event;
exception when others then
  -- Never lock everyone out because this check itself failed.
  return event;
end;
$$;

revoke execute on function public.staff_password_only_hook(jsonb) from public, anon, authenticated;
grant execute on function public.staff_password_only_hook(jsonb) to supabase_auth_admin;

-- Sign out any staff session that was opened with an emailed link/code
-- (lists them as it goes). Password sessions stay signed in.
delete from auth.sessions s
using auth.mfa_amr_claims a
where a.session_id = s.id
  and a.authentication_method in ('magiclink', 'otp', 'recovery', 'invite', 'email/signup', 'oauth', 'sso/saml')
  and s.user_id in (select id from public.profiles)
returning s.user_id, s.created_at;
