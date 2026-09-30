// Pictures the inner pages (Dịch vụ, Quy trình) are drawn with — all from
// the studio's own projects, each linking back to it. w × h are the
// pictures' own proportions, so nothing is cropped that shouldn't be.

const P = (file: string) => `https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/${file}`;

export type PageArt = { src: string; w: number; h: number; projectId: string; title: string };

// Princess and The Frog (a cover, start to finish): the one book whose
// every stage — characters, thumbnails, pencil, colour, lettering, the
// printed copy — is in its project.
const PRINCESS = { projectId: "693127be-e056-49a0-8773-f622cb3ed920", title: "Princess and The Frog" };
export const PROCESS_ART = {
  project: PRINCESS,
  characters: [
    { ...PRINCESS, src: P("e5b6faba-b712-45d9-bdec-ae8101811cd5.png"), w: 420, h: 557 },
    { ...PRINCESS, src: P("de866b13-ec52-4034-9f16-0c967bb2c3ce.png"), w: 420, h: 524 },
  ],
  thumbnails: { ...PRINCESS, src: P("e1ca70bd-a693-49b3-b121-44f3d265da02.jpg"), w: 420, h: 330 },
  sketch: { ...PRINCESS, src: P("99442408-bcee-4d91-b167-ea20a2a42b8e.jpg"), w: 420, h: 535 },
  color: { ...PRINCESS, src: P("060fa834-13a1-49d5-8322-cae703cdf4af.jpg"), w: 420, h: 535 },
  lettered: { ...PRINCESS, src: P("15b320d5-d8e8-4814-bbac-706e36425dbd.jpg"), w: 420, h: 535 },
  printed: { ...PRINCESS, src: P("b3870d1c-d1b2-4bfd-aa67-780ebc97adfb.jpg"), w: 420, h: 280 },
} satisfies Record<string, unknown>;

// Dịch vụ: a page spread, a cover and two characters, pinned up together.
export const SERVICES_ART: { spread: PageArt; cover: PageArt; characters: [PageArt, PageArt] } = {
  spread: {
    projectId: "717a9293-6c15-46e5-a5fc-8756f9a284bb",
    title: "The Mystical Amulet",
    src: P("58afff7c-af6f-460f-80c1-daefb23036f2.jpg"),
    w: 640,
    h: 396,
  },
  cover: {
    projectId: "e2f278ca-322c-4e13-bb66-70bb095f2472",
    title: "What's a Kangaburra",
    src: P("967d409e-957e-49e4-9bd3-d82409b22c50.png"),
    w: 3,
    h: 4,
  },
  // the princess and the frog, cut out
  characters: [{ ...PROCESS_ART.characters[0] }, { ...PROCESS_ART.characters[1] }],
};

// "Xem mẫu" on each service card (in t.home.services order) opens the
// projects page on this category; null = all projects.
export const SERVICE_SAMPLE_CATEGORY: (string | null)[] = [
  "Sách tranh",
  "Character Design",
  "Sách giáo dục",
  "Sách tranh",
  "Product & Merch",
  null,
];
