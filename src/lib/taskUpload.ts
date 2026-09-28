import { createClient } from "@/lib/supabase/client";
import { recordTaskAttachment } from "@/lib/actions/task-detail";
import type { TaskAttachment } from "@/lib/types";

// The bucket's own size limit (supabase/schema.sql, task-attachments).
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

// Anything a browser would run as a page if opened from the bucket's URL.
const BLOCKED = /\.(html?|xhtml|svg|js|mjs)$/i;

// Browser → Supabase Storage directly, then the server records it. Any file
// type the studio works with (PSD, AI, ZIP, PDF, images) up to 50MB.
export async function uploadTaskFile(taskId: string, file: File): Promise<TaskAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`"${file.name}" lớn hơn 50MB`);
  if (BLOCKED.test(file.name) || /html|svg|javascript/i.test(file.type)) throw new Error(`Không đính kèm được loại tệp của "${file.name}"`);
  const ext = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1]?.toLowerCase() ?? (file.type.startsWith("image/") ? file.type.slice(6).replace(/\W/g, "") : "bin");
  const storagePath = `${taskId}/${crypto.randomUUID()}.${ext}`;
  const mimeType = file.type || "application/octet-stream";
  const { error } = await createClient().storage.from("task-attachments").upload(storagePath, file, { contentType: mimeType });
  if (error) throw new Error(`Không tải được "${file.name}" lên`);
  return recordTaskAttachment(taskId, { storagePath, filename: file.name || `anh.${ext}`, mimeType, size: file.size });
}

// The files carried by a paste or a drop (a screenshot, a copied image, files from Finder).
export const filesFrom = (list: FileList | null | undefined) => Array.from(list ?? []).filter((f) => f.size > 0);
