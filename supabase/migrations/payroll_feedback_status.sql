-- Adds a Duyệt/Từ chối status to employee payroll feedback, and lets the
-- director/PM update it. Run once in the Supabase Dashboard SQL Editor.

alter table public.payroll_feedback add column if not exists status text not null default 'pending';
alter table public.payroll_feedback drop constraint if exists payroll_feedback_status_check;
alter table public.payroll_feedback add constraint payroll_feedback_status_check
  check (status in ('pending', 'approved', 'rejected'));

drop policy if exists "director or pm can resolve payroll feedback" on public.payroll_feedback;
create policy "director or pm can resolve payroll feedback"
  on public.payroll_feedback for update
  to authenticated
  using (public.can_manage_hr())
  with check (public.can_manage_hr());
