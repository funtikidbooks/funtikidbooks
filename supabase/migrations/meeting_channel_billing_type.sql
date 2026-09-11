-- Whether a project room is billed "theo giờ" (hourly) or "theo chặng"
-- (milestone/fixed-price per phase) — set when creating the room, editable
-- afterward from its "Thông tin phòng" panel (director, or the room's own
-- creator). Only 'hourly' rooms show up as a row on the "Báo cáo giờ"
-- timesheet. Existing rooms default to 'hourly' (the timesheet already
-- showed every room before this column existed) so sếp Phúc can review
-- each one and flip the milestone-based ones off rather than the
-- timesheet suddenly going empty. Run once in the Supabase Dashboard SQL
-- Editor.

alter table public.meeting_channels add column if not exists billing_type text not null default 'hourly';

alter table public.meeting_channels drop constraint if exists meeting_channels_billing_type_check;
alter table public.meeting_channels add constraint meeting_channels_billing_type_check
  check (billing_type in ('hourly', 'milestone'));
