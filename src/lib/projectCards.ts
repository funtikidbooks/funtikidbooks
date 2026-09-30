import type { Project } from "@/lib/types";

// How projects show on the Dự án grid. Most projects' cover_image_url is a
// presentation board (title art, mockups, credits) — busy at thumbnail size —
// so a project can stand on the grid with one clean picture of its own.
// Editors change both lists on the page itself (★ Ghim nổi bật, 🖼 Ảnh thẻ);
// these are only the starting point.

export const FEATURED_KEY = "du-an-noi-bat"; // string[] of project ids, in order
export const CARD_ART_KEY = "du-an-anh-the"; // { [projectId]: image url }

const P = (file: string) => `https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/${file}`;

// Eight strong books; where the cover is a busy board, a spread from inside
// it (no text on it) stands in. Toffee and Coconut have clean flat covers.
const STARTERS: { id: string; art?: string }[] = [
  { id: "717a9293-6c15-46e5-a5fc-8756f9a284bb", art: P("58afff7c-af6f-460f-80c1-daefb23036f2.jpg") }, // The Mystical Amulet
  { id: "cffda9ac-eb81-495a-b72b-d28e4512918d", art: P("cfdf0482-90b0-4f39-8ead-6d1f234bf67f.jpg") }, // Freddie the Fox Cubs
  { id: "ca828cdb-ec6e-459f-9628-a967477d06be", art: P("ca80e5fd-7d95-47d9-adb7-1a2e432c940a.jpg") }, // Bà Ngoại Trên Mây
  { id: "a1a19e4f-87cc-4547-9229-f424e71aff38" }, // Toffee Finds His Home
  { id: "19327c46-37c6-49be-9458-404c551098b5", art: P("545f607e-9f31-43c7-9980-ffe91d3c2ac4.jpg") }, // The Cat Distribution System
  { id: "65c104eb-f6b9-43e3-9523-0219315b34a3", art: P("948be5e5-8667-49fd-a114-94fd564e631b.jpg") }, // Leo the Lazy Lion
  { id: "4f1ef684-9b81-4fa1-b012-2cc50ed07729", art: P("baca8e82-0024-4b24-bce3-36b4956eeb81.jpg") }, // Harry's Snake Adventure
  { id: "b48ec18d-30ea-427d-8663-ed16b07e76fe" }, // The Courageous Coconut
];

export const DEFAULT_FEATURED = STARTERS.map((s) => s.id);
export const DEFAULT_CARD_ART: Record<string, string> = Object.fromEntries(STARTERS.filter((s) => s.art).map((s) => [s.id, s.art!]));

// Every picture a project has: its cover, its gallery, and the images in
// its write-up — the choices for its card picture.
export function projectImages(p: Pick<Project, "cover_image_url" | "gallery_images" | "content">): string[] {
  const inContent = [...(p.content ?? "").matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const all = [p.cover_image_url, ...(p.gallery_images ?? []), ...inContent].filter((s): s is string => !!s && !s.startsWith("data:"));
  return [...new Set(all)];
}
