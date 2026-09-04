-- "Tài liệu" — a director/PM-only file library for external reference
-- documents (SOP, thuế, bảo hiểm nhân viên, bảng lương gốc, v.v.), organized
-- into free-text folders so they stay easy to browse instead of piling up
-- loose in someone's Google Drive. Same can_manage_hr() gate and private-
-- bucket-with-signed-URLs pattern as staff_id_documents — these files are
-- exactly as sensitive (tax filings, insurance, payroll). Run once in the
-- Supabase Dashboard SQL Editor.

create table if not exists public.document_library_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Free-text, not a fixed enum — sếp Phúc names folders as needed (SOP,
  -- Thuế, Bảo hiểm, Bảng lương...); null means "Chưa phân loại".
  folder text,
  file_path text not null,
  file_name text not null,
  file_size integer,
  mime_type text,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_library_items_folder_idx
  on public.document_library_items (folder);

alter table public.document_library_items enable row level security;

drop policy if exists "hr can manage document library items" on public.document_library_items;
create policy "hr can manage document library items"
  on public.document_library_items for all
  to authenticated
  using (public.can_manage_hr())
  with check (public.can_manage_hr());

drop trigger if exists document_library_items_set_updated_at on public.document_library_items;
create trigger document_library_items_set_updated_at
  before update on public.document_library_items
  for each row execute procedure public.set_updated_at();

-- Private bucket — tax/insurance/payroll files, same reasoning as
-- staff-id-documents: never a permanent public URL, only short-lived signed
-- URLs handed out server-side on demand (see lib/actions/documentsLibrary.ts).
insert into storage.buckets (id, name, public)
values ('documents-library', 'documents-library', false)
on conflict (id) do nothing;

drop policy if exists "hr can manage document library storage" on storage.objects;
create policy "hr can manage document library storage"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'documents-library' and public.can_manage_hr())
  with check (bucket_id = 'documents-library' and public.can_manage_hr());
