-- Lets a director/PM type one flat number for a payslip's base pay
-- ("lương cứng tháng này") that overrides the usual rate × ngày công
-- calculation entirely, for staff paid a guaranteed monthly amount
-- regardless of attendance. Nullable — most records still compute
-- base_salary from work_days as before. Run once in the Supabase
-- Dashboard SQL Editor.

alter table public.payroll_records add column if not exists fixed_amount numeric;
