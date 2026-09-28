-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.
--
-- Closes a privilege-escalation hole: the "a user can update their own
-- profile" policy only pinned access_role, so a signed-in staff member
-- could call the API directly and set their own `role` (chức danh) to
-- 'Project Manager' — which can_manage_hr() / is_director_or_pm() treat as
-- HR access (bảng lương, chấm công, nhân sự, hợp đồng, hoá đơn…) — or move
-- their own joined_at (thử việc dates).
--
-- 1) Only the director may change role, access_role, joined_at or email.
--    Everyone keeps editing their own name, phone, address, avatar, theme.
--    Server-side service-role calls (auth.uid() is null — account
--    creation, the SQL editor) are not affected.
-- 2) Every change to those fields is logged in profile_changes — who
--    changed what, from what, to what, when — readable by the director on
--    Quản trị → Nhân sự & phân quyền.

create table if not exists public.profile_changes (
  id bigint generated always as identity primary key,
  -- No foreign key on purpose: the history outlives a deleted account.
  profile_id uuid not null,
  changed_by uuid,
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create index if not exists profile_changes_changed_at_idx on public.profile_changes (changed_at desc);

alter table public.profile_changes enable row level security;

drop policy if exists "profile_changes readable by director" on public.profile_changes;
create policy "profile_changes readable by director"
  on public.profile_changes for select
  to authenticated
  using (public.current_access_role() = 'director');
-- No insert/update/delete policies: only the trigger below writes here.

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_is_director boolean := false;
begin
  if actor is not null then
    select p.access_role = 'director' into actor_is_director from public.profiles p where p.id = actor;
    if not coalesce(actor_is_director, false) and (
         new.role is distinct from old.role
      or new.access_role is distinct from old.access_role
      or new.joined_at is distinct from old.joined_at
      or new.email is distinct from old.email
    ) then
      raise exception 'Chỉ Giám đốc mới đổi được chức danh, quyền, ngày tham gia hoặc email.'
        using errcode = '42501';
    end if;
  end if;

  if new.role is distinct from old.role then
    insert into public.profile_changes (profile_id, changed_by, field, old_value, new_value)
    values (new.id, actor, 'role', old.role, new.role);
  end if;
  if new.access_role is distinct from old.access_role then
    insert into public.profile_changes (profile_id, changed_by, field, old_value, new_value)
    values (new.id, actor, 'access_role', old.access_role, new.access_role);
  end if;
  if new.joined_at is distinct from old.joined_at then
    insert into public.profile_changes (profile_id, changed_by, field, old_value, new_value)
    values (new.id, actor, 'joined_at', old.joined_at::text, new.joined_at::text);
  end if;
  if new.email is distinct from old.email then
    insert into public.profile_changes (profile_id, changed_by, field, old_value, new_value)
    values (new.id, actor, 'email', old.email, new.email);
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();
