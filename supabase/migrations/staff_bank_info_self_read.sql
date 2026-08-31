-- Lets a staff member read their OWN bank_info row (not anyone else's) —
-- backs the bank card now shown on their own "Bảng lương tháng này" panel
-- at /workspace/cham-cong. The director's existing full-access policy is
-- untouched; this only adds a second, narrower SELECT policy for staff.
-- Run once in the Supabase Dashboard SQL Editor.

drop policy if exists "staff can read own bank info" on public.staff_bank_info;
create policy "staff can read own bank info"
  on public.staff_bank_info for select
  to authenticated
  using (profile_id = auth.uid());
