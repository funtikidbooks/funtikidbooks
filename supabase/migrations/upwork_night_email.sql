-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.
--
-- Ca đêm Upwork now works from Upwork's own job-alert EMAILS (read from
-- Gmail) instead of browsing upwork.com — nothing ever touches Upwork's
-- site automatically. An email carries the job, budget and description but
-- not the client's history, so each lead gets a job-fit score here and the
-- client checks (payment verified, reviews, hire rate, total spent) are left
-- for sếp/PM when they open the job to send.

alter table public.upwork_leads add column if not exists fit_score smallint check (fit_score between 1 and 5);
alter table public.upwork_leads add column if not exists recommendation text check (recommendation in ('strong', 'maybe'));
alter table public.upwork_leads add column if not exists template_name text;
alter table public.upwork_leads add column if not exists client_region text;
alter table public.upwork_leads add column if not exists send_window text;
alter table public.upwork_leads add column if not exists posted_at timestamptz;
