-- Bảo mật lương (2/11/2026). Sếp Phúc asked for a careful check that no
-- staff member can find a way to see a colleague's pay. The salary tables
-- themselves were already tight (payroll_records, staff_salary,
-- salary_advances, staff_bank_info, staff_documents: your own rows only;
-- everyone's only for a Giám đốc, and for the Project Manager where the
-- policies say so). What this closes:
--
-- 1) The shared file store (task-attachments) could be LISTED by anyone,
--    without even signing in: every staff bank QR code (bank-qr/), the
--    signatures on contracts (staff-documents/), every private chat image
--    (dm/)… And any signed-in account could DELETE any file in it — enough
--    to swap a colleague's salary QR for one's own and have their pay sent
--    to the wrong account. Files still open by their link (which can't be
--    guessed), as <img> tags need, but only whoever uploaded a file, or a
--    Giám đốc, can list or delete it.
-- 2) A payslip comment or "đã kiểm tra, đúng" could be attached to someone
--    else's payslip, and staff could mark their own comment approved. Now
--    only on your own payslip; only Giám đốc / PM decide a comment.
-- 3) Signing up on the public site (the customer email link, or Supabase's
--    sign-up API called directly) gave anyone who left out the "client" tag
--    a STAFF profile. Staff profiles are now made only by Quản trị → Nhân
--    sự → Tạo tài khoản (createStaffAccount in lib/actions/admin.ts).
--
-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.

-- 1. task-attachments: no listing, no deleting other people's files.
drop policy if exists "anyone can view task attachments" on storage.objects;
drop policy if exists "uploader or director can see task attachments" on storage.objects;
create policy "uploader or director can see task attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and (owner_id = (select auth.uid())::text or owner = (select auth.uid()) or public.current_access_role() = 'director')
  );

drop policy if exists "staff can delete task attachments" on storage.objects;
drop policy if exists "uploader or director can delete task attachments" on storage.objects;
create policy "uploader or director can delete task attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and (owner_id = (select auth.uid())::text or owner = (select auth.uid()) or public.current_access_role() = 'director')
  );

-- 2. Payslip comments and confirmations: your own payslip only.
drop policy if exists "staff can add and read own payroll feedback" on public.payroll_feedback;
drop policy if exists "staff can read own payroll feedback" on public.payroll_feedback;
create policy "staff can read own payroll feedback"
  on public.payroll_feedback for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "staff can comment on own payslip" on public.payroll_feedback;
create policy "staff can comment on own payslip"
  on public.payroll_feedback for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and exists (select 1 from public.payroll_records r where r.id = payroll_record_id and r.profile_id = auth.uid())
  );

drop policy if exists "staff can confirm own payroll" on public.payroll_confirmations;
drop policy if exists "staff can read own payroll confirmations" on public.payroll_confirmations;
create policy "staff can read own payroll confirmations"
  on public.payroll_confirmations for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "staff can confirm own payslip" on public.payroll_confirmations;
create policy "staff can confirm own payslip"
  on public.payroll_confirmations for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.payroll_records r where r.id = payroll_record_id and r.profile_id = auth.uid())
  );

-- confirmMyPayroll() upserts, so confirming again updates the same row.
drop policy if exists "staff can re-confirm own payslip" on public.payroll_confirmations;
create policy "staff can re-confirm own payslip"
  on public.payroll_confirmations for update
  to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.payroll_records r where r.id = payroll_record_id and r.profile_id = auth.uid())
  );

-- 3. A sign-up never becomes staff. Customers stay in public.clients;
--    staff are created by the director, who writes their profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  return new;
end;
$$;
