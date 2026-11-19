// Vector files from traced outlines: SVG (Illustrator, Inkscape, Affinity,
// Corel, browsers), PDF and EPS (printers' RIPs, Illustrator, CorelDRAW).
// Sized from the picture's dpi, so a 300 dpi A5 picture comes out 148 mm wide.
//
// Two ways to draw the same paths:
//   "fill"   — the line is a shape (a compound path, holes cut out of it):
//              brush strokes keep their thick and thin parts.
//   "stroke" — each path is one line with a stroke width of its own, closed
//              where the line is closed: die lines, cut lines, hairlines.
import type { Outline } from "./trace";

export type VectorDoc = {
  outlines: Outline[];
  closed: boolean[];
  width: number; // picture size in pixels
  height: number;
  dpi: number;
  mode: "fill" | "stroke";
  color: string; // #rrggbb
  strokeMm: number; // stroke width, for "stroke"
};

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}
const isBlack = (c: [number, number, number]) => c[0] === 0 && c[1] === 0 && c[2] === 0;

// Is a curve really a straight line: both handles on the chord, between its ends?
function straight(o: Outline, i: number, x0: number, y0: number): boolean {
  const x = o[i + 4];
  const y = o[i + 5];
  const dx = x - x0;
  const dy = y - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  for (const k of [0, 2]) {
    const px = o[i + k] - x0;
    const py = o[i + k + 1] - y0;
    const along = (px * dx + py * dy) / len;
    const off = Math.abs(px * dy - py * dx) / len;
    if (off > 0.02 || along < -0.02 || along > len + 0.02) return false;
  }
  return true;
}

// ---------------------------------------------------------------- SVG

export function svgOf(doc: VectorDoc): string {
  const mm = 25.4 / doc.dpi;
  const U = 1000; // coordinates in 0.001 mm
  const w = (doc.width * mm).toFixed(3);
  const h = (doc.height * mm).toFixed(3);
  const num = (v: number) => String(v / U);
  const pathOf = (list: number[]) => {
    const parts: string[] = [];
    for (const idx of list) {
      const o = doc.outlines[idx];
      let cx = Math.round(o[0] * mm * U);
      let cy = Math.round(o[1] * mm * U);
      parts.push(`M${num(cx)} ${num(cy)}`);
      let px = o[0];
      let py = o[1];
      for (let i = 2; i < o.length; i += 6) {
        const nx = Math.round(o[i + 4] * mm * U);
        const ny = Math.round(o[i + 5] * mm * U);
        if (straight(o, i, px, py)) parts.push(`l${num(nx - cx)} ${num(ny - cy)}`);
        else {
          const ax = Math.round(o[i] * mm * U);
          const ay = Math.round(o[i + 1] * mm * U);
          const bx = Math.round(o[i + 2] * mm * U);
          const by = Math.round(o[i + 3] * mm * U);
          parts.push(`c${num(ax - cx)} ${num(ay - cy)} ${num(bx - cx)} ${num(by - cy)} ${num(nx - cx)} ${num(ny - cy)}`);
        }
        cx = nx;
        cy = ny;
        px = o[i + 4];
        py = o[i + 5];
      }
      if (doc.closed[idx]) parts.push("z");
    }
    return parts.join("");
  };
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n`;
  if (doc.mode === "fill") {
    const all = doc.outlines.map((_, i) => i);
    return `${head}<path fill="${doc.color}" fill-rule="nonzero" d="${pathOf(all)}"/>\n</svg>\n`;
  }
  const lines = doc.outlines.map((_, i) => `<path d="${pathOf([i])}"/>`);
  // the cut-line pink is the printers' CutContour, named the way the sticker tool's cut file names it
  const id = doc.color.toUpperCase() === "#EC008C" ? ' id="CutContour"' : "";
  return `${head}<g${id} fill="none" stroke="${doc.color}" stroke-width="${doc.strokeMm}" stroke-linecap="round" stroke-linejoin="round">\n${lines.join("\n")}\n</g>\n</svg>\n`;
}

// ---------------------------------------------------- PDF and EPS paths

// Path operators in the page's own units (points, y up). `ops` names the
// operators: PDF m/l/c/h, EPS the same names defined in its prologue.
function pageContent(doc: VectorDoc, flipY: boolean): { body: string; w: number; h: number } {
  const pt = 72 / doc.dpi;
  const W = doc.width * pt;
  const H = doc.height * pt;
  const f = (v: number) => String(Math.round(v * 1000) / 1000);
  const X = (x: number) => f(x * pt);
  const Y = (y: number) => f(flipY ? H - y * pt : y * pt);
  const out: string[] = [];
  const draw = (idx: number) => {
    const o = doc.outlines[idx];
    out.push(`${X(o[0])} ${Y(o[1])} m`);
    let px = o[0];
    let py = o[1];
    for (let i = 2; i < o.length; i += 6) {
      if (straight(o, i, px, py)) out.push(`${X(o[i + 4])} ${Y(o[i + 5])} l`);
      else out.push(`${X(o[i])} ${Y(o[i + 1])} ${X(o[i + 2])} ${Y(o[i + 3])} ${X(o[i + 4])} ${Y(o[i + 5])} c`);
      px = o[i + 4];
      py = o[i + 5];
    }
    if (doc.closed[idx]) out.push("h");
  };
  if (doc.mode === "fill") {
    for (let i = 0; i < doc.outlines.length; i++) draw(i);
    out.push("f");
  } else {
    for (let i = 0; i < doc.outlines.length; i++) {
      draw(i);
      out.push("S");
    }
  }
  return { body: out.join("\n"), w: W, h: H };
}

function colorOps(doc: VectorDoc, cmykOp: string, rgbOp: string): string {
  const c = rgb(doc.color);
  if (isBlack(c)) return `0 0 0 1 ${cmykOp}`; // printed as plain black ink, not a mix of four
  return `${c.map((v) => Math.round((v / 255) * 1000) / 1000).join(" ")} ${rgbOp}`;
}

export function pdfOf(doc: VectorDoc): Uint8Array {
  const { body, w, h } = pageContent(doc, true);
  const f = (v: number) => String(Math.round(v * 1000) / 1000);
  const stroke = doc.mode === "stroke";
  const content =
    `q\n` +
    (stroke ? `${f((doc.strokeMm * 72) / 25.4)} w 1 J 1 j\n${colorOps(doc, "K", "RG")}\n` : `${colorOps(doc, "k", "rg")}\n`) +
    `${body}\nQ\n`;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(w)} ${f(h)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
  ];
  let text = `%PDF-1.4\n`;
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) text += `${String(o).padStart(10, "0")} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

export function epsOf(doc: VectorDoc): string {
  const { body, w, h } = pageContent(doc, true);
  const f = (v: number) => String(Math.round(v * 1000) / 1000);
  const stroke = doc.mode === "stroke";
  return (
    `%!PS-Adobe-3.0 EPSF-3.0\n` +
    `%%Creator: Funti Kidbooks\n` +
    `%%BoundingBox: 0 0 ${Math.ceil(w)} ${Math.ceil(h)}\n` +
    `%%HiResBoundingBox: 0 0 ${f(w)} ${f(h)}\n` +
    `%%LanguageLevel: 2\n%%Pages: 1\n%%EndComments\n` +
    `%%BeginProlog\n/m {moveto} bind def /l {lineto} bind def /c {curveto} bind def /h {closepath} bind def\n` +
    `/f {fill} bind def /S {stroke} bind def\n%%EndProlog\n%%Page: 1 1\ngsave\n` +
    (stroke ? `${f((doc.strokeMm * 72) / 25.4)} setlinewidth 1 setlinecap 1 setlinejoin\n` : ``) +
    `${colorOps(doc, "setcmykcolor", "setrgbcolor")}\n${body}\ngrestore\n%%Trailer\n%%EOF\n`
  );
}
