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

-- Without this, the live red-dot/feedback-list updates never fire — the
-- RLS policies above only control who CAN read/write, not whether Realtime
-- broadcasts changes at all.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payroll_feedback'
  ) then
    alter publication supabase_realtime add table public.payroll_feedback;
  end if;
end $$;
