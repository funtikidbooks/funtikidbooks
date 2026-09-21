-- Clients signing in through Work With Funti (/cong-viec) must not get a
-- staff `profiles` row: it made them appear in Chấm công / member lists and
-- gave them access_role 'staff'. The portal now tags its sign-ups with
-- raw_user_meta_data.signup_source = 'client'; skip those here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.raw_user_meta_data ->> 'signup_source' = 'client' then
    return new;
  end if;

  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
