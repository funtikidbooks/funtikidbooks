-- Adds the "Đặt đồ ăn" (food order) room — an always-open room like "Chung"
-- (no need to join), plus its group-order tool: one round per day, everyone
-- adds their own item, whoever places the real ShopeeFood order pastes the
-- link back for everyone to see. Run once in the Supabase Dashboard SQL
-- Editor.

alter table public.meeting_channels add column if not exists is_food_room boolean not null default false;

drop policy if exists "creator or director can update channels" on public.meeting_channels;
drop policy if exists "creator, director, or PM (for Chung) can update channels" on public.meeting_channels;
create policy "creator, director, or PM (for Chung/food room) can update channels"
  on public.meeting_channels for update
  to authenticated
  using (created_by = auth.uid() or public.current_access_role() = 'director' or ((is_general or is_food_room) and public.is_director_or_pm()))
  with check (created_by = auth.uid() or public.current_access_role() = 'director' or ((is_general or is_food_room) and public.is_director_or_pm()));

drop policy if exists "channel members can read messages" on public.meeting_messages;
create policy "channel members can read messages"
  on public.meeting_messages for select
  to authenticated
  using (
    exists (select 1 from public.meeting_channels c where c.id = meeting_messages.channel_id and (c.is_general or c.is_food_room))
    or exists (
      select 1 from public.meeting_channel_members m
      where m.channel_id = meeting_messages.channel_id and m.profile_id = auth.uid()
    )
    or public.current_access_role() = 'director'
  );

drop policy if exists "channel members can send messages" on public.meeting_messages;
create policy "channel members can send messages"
  on public.meeting_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      exists (select 1 from public.meeting_channels c where c.id = meeting_messages.channel_id and (c.is_general or c.is_food_room))
      or exists (
        select 1 from public.meeting_channel_members m
        where m.channel_id = meeting_messages.channel_id and m.profile_id = auth.uid()
      )
    )
  );

drop policy if exists "channel members can pin messages" on public.meeting_messages;
create policy "channel members can pin messages"
  on public.meeting_messages for update
  to authenticated
  using (
    exists (
      select 1 from public.meeting_channels c
      where c.id = meeting_messages.channel_id
        and (
          c.is_general
          or c.is_food_room
          or exists (
            select 1 from public.meeting_channel_members m
            where m.channel_id = c.id and m.profile_id = auth.uid()
          )
        )
    )
    or public.current_access_role() = 'director'
  )
  with check (true);

drop policy if exists "channel members can read reactions" on public.meeting_message_reactions;
create policy "channel members can read reactions"
  on public.meeting_message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.meeting_messages msg
      join public.meeting_channels c on c.id = msg.channel_id
      where msg.id = meeting_message_reactions.message_id
        and (
          c.is_general
          or c.is_food_room
          or exists (
            select 1 from public.meeting_channel_members m
            where m.channel_id = c.id and m.profile_id = auth.uid()
          )
        )
    )
    or public.current_access_role() = 'director'
  );

-- Seed the room itself once.
insert into public.meeting_channels (name, icon, is_food_room)
select 'Đặt đồ ăn', '🍱', true
where not exists (select 1 from public.meeting_channels where is_food_room);

-- ---------------------------------------------------------------------------
-- food_order_rounds / food_order_items
-- ---------------------------------------------------------------------------
create table if not exists public.food_order_rounds (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.meeting_channels (id) on delete cascade,
  order_date date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  title text not null default 'Đặt đồ ăn',
  deadline_at timestamptz,
  shopee_link text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (channel_id, order_date)
);

alter table public.food_order_rounds enable row level security;

drop policy if exists "staff can read food order rounds" on public.food_order_rounds;
create policy "staff can read food order rounds"
  on public.food_order_rounds for select
  to authenticated
  using (true);

drop policy if exists "staff can start food order rounds" on public.food_order_rounds;
create policy "staff can start food order rounds"
  on public.food_order_rounds for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "staff can update food order rounds" on public.food_order_rounds;
create policy "staff can update food order rounds"
  on public.food_order_rounds for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "creator or director can delete food order rounds" on public.food_order_rounds;
create policy "creator or director can delete food order rounds"
  on public.food_order_rounds for delete
  to authenticated
  using (created_by = auth.uid() or public.current_access_role() = 'director');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'food_order_rounds'
  ) then
    alter publication supabase_realtime add table public.food_order_rounds;
  end if;
end $$;

create table if not exists public.food_order_items (
  round_id uuid not null references public.food_order_rounds (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  item_text text not null,
  note text,
  price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (round_id, profile_id)
);

alter table public.food_order_items enable row level security;

drop policy if exists "staff can read food order items" on public.food_order_items;
create policy "staff can read food order items"
  on public.food_order_items for select
  to authenticated
  using (true);

drop policy if exists "staff can add own food order item" on public.food_order_items;
create policy "staff can add own food order item"
  on public.food_order_items for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "staff can update own food order item" on public.food_order_items;
create policy "staff can update own food order item"
  on public.food_order_items for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "staff or director can delete a food order item" on public.food_order_items;
create policy "staff or director can delete a food order item"
  on public.food_order_items for delete
  to authenticated
  using (profile_id = auth.uid() or public.current_access_role() = 'director');

drop trigger if exists food_order_items_set_updated_at on public.food_order_items;
create trigger food_order_items_set_updated_at
  before update on public.food_order_items
  for each row execute procedure public.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'food_order_items'
  ) then
    alter publication supabase_realtime add table public.food_order_items;
  end if;
end $$;
