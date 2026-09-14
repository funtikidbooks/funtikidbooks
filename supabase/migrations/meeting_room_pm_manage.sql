-- Lets a Project Manager rename/lock/change the project type of ANY room
-- (not just "Chung"/food rooms) and kick a member out of any room, the
-- same as a director already could — matching the app's RoomInfoDropdown,
-- which already shows both to a PM regardless of who created the room.
-- Run once in the Supabase Dashboard SQL Editor.

drop policy if exists "creator, director, or PM (for Chung/food room) can update channels" on public.meeting_channels;
create policy "creator, director, or PM can update channels"
  on public.meeting_channels for update
  to authenticated
  using (created_by = auth.uid() or public.is_director_or_pm())
  with check (created_by = auth.uid() or public.is_director_or_pm());

drop policy if exists "staff or room owner can remove memberships" on public.meeting_channel_members;
create policy "staff, director/PM, or room owner can remove memberships"
  on public.meeting_channel_members for delete
  to authenticated
  using (
    profile_id = auth.uid()
    or public.is_director_or_pm()
    or exists (
      select 1 from public.meeting_channels c
      where c.id = meeting_channel_members.channel_id and c.created_by = auth.uid()
    )
  );
