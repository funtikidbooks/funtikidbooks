// Chat attachments and avatars only ever save the public URL Supabase
// Storage hands back on upload — no separate storage_path column like
// task_attachments/fonts/brushes have — so deleting the underlying file
// later means reconstructing the bucket-relative path from that URL.
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}
