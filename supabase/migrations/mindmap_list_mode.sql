-- Run once in the Supabase Dashboard SQL Editor.
-- Lets a mindmap node act as a "list container" — its children render as
-- rows stacked inside its own card (title + growing list + a ✕ per row)
-- instead of as separate draggable boxes connected by lines. sếp Phúc's
-- own sketch: one box titled "SEO website" that just grows taller as
-- blog-post branches are added inside it.
alter table public.mindmap_nodes add column if not exists list_mode boolean not null default false;
