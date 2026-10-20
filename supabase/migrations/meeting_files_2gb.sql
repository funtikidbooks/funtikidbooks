-- Meeting-room files up to 2GB (20/10/2026). The task-attachments bucket
-- (chat files and task card files) was capped at 50MB. Task cards keep their
-- own 50MB check in the app (lib/taskUpload.ts); only chat rooms offer 2GB.
-- Also needs the project-wide "Upload file size limit" in the Supabase
-- dashboard (Storage → Settings) at 2GB or more.
update storage.buckets
set file_size_limit = 2147483648
where id = 'task-attachments';
