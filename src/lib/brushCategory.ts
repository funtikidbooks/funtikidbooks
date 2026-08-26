import type { BrushCategory } from "@/lib/types";

// Single source of truth for the 3 supported brush apps — shared by the
// upload server action (extension validation) and the library UI (labels,
// filter chips, the file picker's accept attribute).
export const BRUSH_CATEGORIES: BrushCategory[] = ["photoshop", "procreate", "clip_studio"];

export const BRUSH_CATEGORY_LABELS: Record<BrushCategory, string> = {
  photoshop: "Photoshop",
  procreate: "Procreate",
  clip_studio: "Clip Studio Paint",
};

export const BRUSH_CATEGORY_EXT: Record<BrushCategory, string[]> = {
  photoshop: ["abr"],
  procreate: ["brush", "brushset"],
  clip_studio: ["sut"],
};
