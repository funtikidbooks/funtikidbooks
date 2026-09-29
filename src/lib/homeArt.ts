// Pictures the home page shows, picked by hand from the studio's own
// projects (Quản trị → Dự án): each links back to its project. A project
// taken down from the site simply drops out of these.

// w × h: the picture's proportions, so the wall can be laid out before it loads.
export type HomeArt = { projectId: string; src: string; title: string; w: number; h: number };

// Tranh nổi bật — interior spreads and character art, not covers.
export const HOME_GALLERY: HomeArt[] = [
  {
    "projectId": "ca828cdb-ec6e-459f-9628-a967477d06be",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/ca80e5fd-7d95-47d9-adb7-1a2e432c940a.jpg",
    "title": "Bà Ngoại Trên Mây",
    "w": 640,
    "h": 320
  },
  {
    "projectId": "717a9293-6c15-46e5-a5fc-8756f9a284bb",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/58afff7c-af6f-460f-80c1-daefb23036f2.jpg",
    "title": "The Mystical Amulet",
    "w": 640,
    "h": 396
  },
  {
    "projectId": "2faac608-3342-4da8-abe9-2c36e808326d",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/49a8e7f2-4ae3-4052-9269-371950eb801e.png",
    "title": "Chỉ Dài Một Gang Tay",
    "w": 640,
    "h": 320
  },
  {
    "projectId": "a1a19e4f-87cc-4547-9229-f424e71aff38",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/e7a6ef5c-7d9b-441a-adad-b4b645de710d.jpg",
    "title": "Toffee Finds His Home",
    "w": 640,
    "h": 400
  },
  {
    "projectId": "d3dc1e3d-51bd-41e5-b4c8-808cffc78aac",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/abc658f7-0de5-460c-adbe-2612335737a9.jpg",
    "title": "Meagle Sayz",
    "w": 640,
    "h": 400
  },
  {
    "projectId": "f2d1bfee-cd1b-4902-b2cc-cbb82d7439dd",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/358340db-e547-41fe-8099-3445ea5905f4.png",
    "title": "Cat Holiday Illustration Collection",
    "w": 640,
    "h": 711
  },
  {
    "projectId": "16fc1128-f14e-4e06-a6c7-bbca7fe8bdaf",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/bb2fb634-9088-4cfc-a4ab-eb03ff112424.png",
    "title": "Santa Raps",
    "w": 640,
    "h": 320
  },
  {
    "projectId": "b913b609-dab3-4c39-b1a9-dac41495451a",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/a0ee175d-07d7-4f85-8f62-bbb6275b4e0d.jpg",
    "title": "ABC Books | EJ",
    "w": 640,
    "h": 227
  },
  {
    "projectId": "08be9179-9f5c-4e59-a64d-2f34455b0976",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/5c20ba2c-2c9a-487e-9817-bdf07f5c303d.jpg",
    "title": "Lost Cat",
    "w": 640,
    "h": 414
  },
  {
    "projectId": "65c104eb-f6b9-43e3-9523-0219315b34a3",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/948be5e5-8667-49fd-a114-94fd564e631b.jpg",
    "title": "Leo the Lazy Lion",
    "w": 640,
    "h": 320
  },
  {
    "projectId": "b48ec18d-30ea-427d-8663-ed16b07e76fe",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/e81646e5-994d-459b-9af4-a919815f93b1.jpg",
    "title": "The Courageous Coconut | Mellisa Moxey",
    "w": 640,
    "h": 396
  },
  {
    "projectId": "4f1ef684-9b81-4fa1-b012-2cc50ed07729",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/baca8e82-0024-4b24-bce3-36b4956eeb81.jpg",
    "title": "Harry's Snake Adventure",
    "w": 640,
    "h": 427
  },
  {
    "projectId": "19327c46-37c6-49be-9458-404c551098b5",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/545f607e-9f31-43c7-9980-ffe91d3c2ac4.jpg",
    "title": "The Cat Distribution System",
    "w": 640,
    "h": 396
  },
  {
    "projectId": "fe82cf65-c3e9-4bcb-9cfa-2f02f6b8e16e",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/ceabad10-aa9e-4349-83fa-2e0b251d02f1.jpg",
    "title": "Boo's Big Adventure",
    "w": 640,
    "h": 320
  },
  {
    "projectId": "33e985e5-3060-4a47-86bd-de3ba3b2b8cc",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/989e24cb-89c5-429e-a1f5-d5b89be342ba.jpg",
    "title": "Thank God, I'm a Little Boy",
    "w": 640,
    "h": 414
  },
  {
    "projectId": "cffda9ac-eb81-495a-b72b-d28e4512918d",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/cfdf0482-90b0-4f39-8ead-6d1f234bf67f.jpg",
    "title": "Freddie the Fox Cubs",
    "w": 640,
    "h": 400
  },
  {
    "projectId": "8e154d19-86a5-47f1-86dc-051178862111",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/ea9623f2-55b7-4273-b96d-9031bd9c2148.jpg",
    "title": "Nora's Big Adventure Begins",
    "w": 640,
    "h": 800
  },
  {
    "projectId": "fc794fbf-6077-45b8-aa2b-ef0a336d4b4b",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/b81d67a3-a617-439c-b7ea-99585fcf3a8c.png",
    "title": "The Frog Who Lost Her Ribbit",
    "w": 640,
    "h": 323
  },
  {
    "projectId": "13197865-06de-4ae5-83ad-a1f6ff250ffb",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/8f605912-b817-47f7-af1c-6cf2fa61374b.png",
    "title": "Adventure of Max and Daisy",
    "w": 640,
    "h": 284
  },
  {
    "projectId": "8a63f10f-68c6-4a32-8ea0-0d6e36dd2b60",
    "src": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/dfebf1f0-ee6e-4607-92f2-f6a661d629bd.jpg",
    "title": "Thank God, I'm a Little Girl",
    "w": 640,
    "h": 414
  }
];

// The books standing on the opening shelf, left to right. Flat front covers
// only — most projects' cover_image_url is a landscape presentation board or
// a mockup photo, which can't stand in for a book. w × h are the covers' own
// proportions, so nothing is cropped.
export const HERO_BOOKS: HomeArt[] = [
  {
    projectId: "cffda9ac-eb81-495a-b72b-d28e4512918d",
    src: "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/28c60503-eb88-4c1e-97e8-16afa51d5752.jpg",
    title: "Freddie the Fox Cub's Big Adventure",
    w: 4,
    h: 5,
  },
  {
    projectId: "e2f278ca-322c-4e13-bb66-70bb095f2472",
    src: "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/967d409e-957e-49e4-9bd3-d82409b22c50.png",
    title: "What's a Kangaburra",
    w: 3,
    h: 4,
  },
  {
    projectId: "3795f5c1-10d2-4f13-bddd-1ad7c1ee47ca",
    src: "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/7489c88b-ce6d-4755-86a8-dd79e3acf8c4.jpg",
    title: "Hank the Highland and the Three Ballerinas",
    w: 1,
    h: 1,
  },
];

// Service cards with no picture uploaded yet (by index in t.home.services).
export const SERVICE_ART: Record<number, string> = {
  "1": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/de866b13-ec52-4034-9f16-0c967bb2c3ce.png",
  "2": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/9cbad76a-7c3f-4bda-820d-02b644e3075c.jpg",
  "3": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/78bb87ec-47b4-44c7-9a1f-298bbfaa0a29.jpg",
  "4": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/aa585919-30b7-4ec0-a908-a09d11c0c44f.jpg",
  "5": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/ed967126-e8b8-444c-b7ba-b10f27761438.jpeg"
};

// Phác thảo → lên màu — site_settings key for the pair the director uploads;
// until then, the same page of Princess and The Frog, line for line.
export const COMPARE_KEY = "trang-chu-phac-thao";
export type ComparePair = { sketch: string; color: string };
export const DEFAULT_COMPARE = {
  "sketch": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/99442408-bcee-4d91-b167-ea20a2a42b8e.jpg",
  "color": "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content/projects/060fa834-13a1-49d5-8322-cae703cdf4af.jpg",
  "projectId": "693127be-e056-49a0-8773-f622cb3ed920"
};
