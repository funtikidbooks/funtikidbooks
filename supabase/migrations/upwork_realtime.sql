-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.
--
-- Tìm khách (Upwork) updates live: a new hourly check, the leads it drafts
-- and any status change (Duyệt, Đã gửi…) reach an open page the moment
-- they're saved. Realtime still honours the director/PM-only read policies
-- in upwork_reports.sql.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'upwork_batches') then
    alter publication supabase_realtime add table public.upwork_batches;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'upwork_leads') then
    alter publication supabase_realtime add table public.upwork_leads;
  end if;
end $$;
