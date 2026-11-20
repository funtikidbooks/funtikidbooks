// Colours for the vector file: what staff type or pick, and which colours are
// too pale to show up on a white screen.

// "#ec008c", "EC008C" or the short "#f0c" → "#EC008C"; anything else → null.
export function normalizeHex(text: string): string | null {
  const t = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(t)) {
    return ("#" + t.split("").map((c) => c + c).join("")).toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(t)) return ("#" + t).toUpperCase();
  return null;
}

// How bright a colour looks: 0 for black … 1 for white.
export function brightness(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// A colour that does not stand out from white paper: drawn on grey instead.
export const isPale = (hex: string): boolean => brightness(hex) > 0.8;

// The printing inks as Illustrator shows them on screen (the colour swatches of
// the tool use the same ones). `plain` is what a CMYK file shows for the pure
// ink when it is read without a colour profile, e.g. 100% magenta as #FF00FF.
const INKS: { hex: string; plain: string }[] = [
  { hex: "#EC008C", plain: "#FF00FF" }, // magenta — the die-line pink
  { hex: "#00AEEF", plain: "#00FFFF" }, // cyan
  { hex: "#FFF200", plain: "#FFFF00" }, // yellow
  { hex: "#ED1C24", plain: "#FF0000" }, // magenta + yellow
  { hex: "#00A651", plain: "#00FF00" }, // cyan + yellow
  { hex: "#2E3192", plain: "#0000FF" }, // cyan + magenta
];

function distance(a: string, b: string): number {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

// The colour measured from the lines of a picture, with a line that is (nearly)
// one of the printing inks given exactly that ink's colour — so the die-line
// pink comes out as #EC008C and keeps its CutContour name. Any other colour is
// left as it is.
export function snapToInk(hex: string, fromCmyk: boolean): string {
  const h = normalizeHex(hex);
  if (!h) return hex;
  for (const ink of INKS) {
    if (distance(h, ink.hex) <= 10) return ink.hex;
    if (fromCmyk && distance(h, ink.plain) <= 30) return ink.hex;
  }
  return h;
}
