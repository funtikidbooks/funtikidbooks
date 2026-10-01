// Supabase Storage Image Transformation (a Supabase Pro-and-up feature) lets
// us ask Supabase's CDN to resize/compress an image on the way out, instead
// of always shipping the original file to the browser. An avatar uploaded at
// up to 8MB but rendered as a 30px circle, or a chat screenshot rendered at
// 240px, has no business downloading the full original every time — this
// turns the public object URL into a render URL that returns a right-sized
// thumbnail instead. Falls back to the original URL untouched for anything
// that isn't a Supabase Storage public URL (a local blob: preview before
// upload finishes, or an external host).
import type { ImageLoader } from "next/image";

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
// any <Image> whose src is one of these Supabase Storage uploads — paired
// with resizedUrl() below so Supabase's own (already-paid-for) transform
// does the actual resizing/compression instead, and Vercel never sees a
// distinct-enough image to bill for.
export function isSupabaseStorageUrl(url: string | null | undefined): boolean {
  return !!url && url.includes(PUBLIC_OBJECT_MARKER);
}

// The smallest of a few fixed widths that covers `cssPx` on this screen —
// a fixed set so the CDN keeps reusing the same few copies of a picture
// instead of making one per window size. At most 2× the CSS size: a 3×
// phone screen doesn't show the difference on a photo, but pays for it.
const FIT_WIDTHS = [480, 720, 1000, 1400, 2000];
export function fitWidth(cssPx: number, max = 1400): number {
  const dpr = typeof window === "undefined" ? 2 : Math.min(window.devicePixelRatio || 1, 2);
  const want = cssPx * dpr;
  return Math.min(FIT_WIDTHS.find((w) => w >= want) ?? max, max);
}

// srcSet for a plain <img> of a Supabase upload — with `sizes`, a phone
// picks a smaller copy than a wide screen instead of everyone getting the
// largest. undefined for anything else (the plain src is used).
export function resizedSrcSet(url: string | null | undefined, widths: number[]): string | undefined {
  if (!isSupabaseStorageUrl(url)) return undefined;
  return widths.map((w) => `${resizedUrl(url, w)} ${w}w`).join(", ");
}

// The same for next/image: its srcSet, served by Supabase's transform (not
// Vercel's, see above), never wider than `max`.
export function supabaseImageLoader(max: number): ImageLoader {
  return ({ src, width, quality }) => resizedUrl(src, Math.min(width, max), quality ?? 75) ?? src;
}

// General-purpose sibling of thumbnailUrl() for non-square content — a
// project cover, hero slide, or news photo, where forcing a fixed
// height (thumbnailUrl's `resize=cover`) would crop it. Only `width` is
// sent, so Supabase scales proportionally and the browser's own
// object-fit handles cropping to whatever the layout actually needs.
export function resizedUrl(url: string | null | undefined, width: number, quality = 75): string | undefined {
  if (!url) return url ?? undefined;
  const idx = url.indexOf(PUBLIC_OBJECT_MARKER);
  if (idx === -1) return url;
  const base = url.slice(0, idx);
  const path = url.slice(idx + PUBLIC_OBJECT_MARKER.length);
  return `${base}/storage/v1/render/image/public/${path}?width=${width}&resize=contain&quality=${quality}`;
}
