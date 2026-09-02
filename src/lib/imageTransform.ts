// Supabase Storage Image Transformation (a Supabase Pro-and-up feature) lets
// us ask Supabase's CDN to resize/compress an image on the way out, instead
// of always shipping the original file to the browser. An avatar uploaded at
// up to 8MB but rendered as a 30px circle, or a chat screenshot rendered at
// 240px, has no business downloading the full original every time — this
// turns the public object URL into a render URL that returns a right-sized
// thumbnail instead. Falls back to the original URL untouched for anything
// that isn't a Supabase Storage public URL (a local blob: preview before
// upload finishes, or an external host).
const PUBLIC_OBJECT_MARKER = "/storage/v1/object/public/";

export function thumbnailUrl(url: string | null | undefined, width: number, height: number = width): string | undefined {
  if (!url) return url ?? undefined;
  const idx = url.indexOf(PUBLIC_OBJECT_MARKER);
  if (idx === -1) return url;
  const base = url.slice(0, idx);
  const path = url.slice(idx + PUBLIC_OBJECT_MARKER.length);
  return `${base}/storage/v1/render/image/public/${path}?width=${width}&height=${height}&resize=cover&quality=70`;
}

// next/image's own optimizer (Vercel's Image Optimization API) bills by
// distinct source image, separately from everything above — a growing
// library of director-uploaded project covers, news photos, hero slides
// etc. eventually exceeds the plan's monthly quota, at which point any
// image next/image hasn't already cached starts 404ing with
// OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED (a real incident, not a typo:
// checked the response header directly). Pass this as `unoptimized` on
// any <Image> whose src is one of these Supabase Storage uploads, so it's
// served as-is — heavier than a resized/WebP version, but never blocked.
export function isSupabaseStorageUrl(url: string | null | undefined): boolean {
  return !!url && url.includes(PUBLIC_OBJECT_MARKER);
}
