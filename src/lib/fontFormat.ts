import type { FontAsset } from "@/lib/types";

export const FONT_FORMAT_BY_EXT: Record<string, string> = {
  ttf: "truetype",
  otf: "opentype",
  woff: "woff",
  woff2: "woff2",
};

export function fontFamilyFor(font: Pick<FontAsset, "id">) {
  return `kho-font-${font.id}`;
}
