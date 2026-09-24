-- Run once in the Supabase Dashboard SQL Editor.
-- A child only gets absorbed into its list-mode parent's card (rendered as
-- a row instead of its own connected box) when it's explicitly flagged as
-- a list item — "+ Thêm bài" inside the card sets this; the node's own
-- corner "+" (a genuinely separate branch, its own box + connector line)
-- leaves it false. Without this, EVERY child of a list-mode node was
-- forced into the list with no way to also branch out normally.
alter table public.mindmap_nodes add column if not exists is_list_item boolean not null default false;
