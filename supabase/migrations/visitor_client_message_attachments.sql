-- Run once in the Supabase Dashboard SQL Editor.
-- Lets the guest chat widget (GuestChatPanel.tsx) attach images and
-- documents (Word/Excel/PDF/…), same as the signed-in client portal
-- already does for images. file_attachments keeps {url, name, size} per
-- file — unlike image_urls, a plain array of URLs, a document's original
-- filename has to be stored separately since its storage path is a random
-- uuid.
alter table public.visitor_messages add column if not exists image_urls jsonb not null default '[]'::jsonb;
alter table public.visitor_messages add column if not exists file_attachments jsonb not null default '[]'::jsonb;

-- client_messages already has image_urls; adding file_attachments here too
-- so claimVisitorConversation() (lib/actions/clientPortal.ts) doesn't drop
-- a guest's document attachments when their chat becomes a real project.
alter table public.client_messages add column if not exists file_attachments jsonb not null default '[]'::jsonb;
