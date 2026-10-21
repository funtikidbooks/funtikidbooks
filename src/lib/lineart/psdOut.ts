// A Photoshop file from a sketch picture: the sketch as the bottom layer,
// the clean line art as a layer above it, and the lines also saved as a
// Photoshop path ("Line art") so any brush can be applied with Stroke Path.
import { encodeChannel } from "../sticker/psd";

class Bytes {
  chunks: Uint8Array[] = [];
  size = 0;
  push(b: Uint8Array) {
    this.chunks.push(b);
    this.size += b.length;
  }
  u8(...v: number[]) {
    this.push(Uint8Array.from(v));
  }
  u16(v: number) {
    this.u8((v >> 8) & 255, v & 255);
  }
  u32(v: number) {
    this.u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  }
  ascii(s: string) {
    this.push(Uint8Array.from(s, (c) => c.charCodeAt(0) & 255));
  }
}

function plane(rgba: Uint8ClampedArray, c: number, w: number, h: number) {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = rgba[i * 4 + c];
  return out;
}

function layerRecord(name: string, ascii: string, w: number, h: number, lens: number[], id: number, opacity: number) {
  const b = new Bytes();
  b.u32(0);
  b.u32(0);
  b.u32(h);
  b.u32(w);
  b.u16(4);
  [-1, 0, 1, 2].forEach((ch, k) => {
    b.u16(ch & 0xffff);
    b.u32(lens[k]);
  });
  b.ascii("8BIMnorm");
  b.u8(opacity, 0, 0x08, 0);
  const extra = new Bytes();
  extra.u32(0);
  extra.u32(0);
  extra.u8(ascii.length);
  extra.ascii(ascii);
  for (let pad = (ascii.length + 1) % 4; pad && pad < 4; pad++) extra.u8(0);
  const luni = new Bytes();
  luni.u32(name.length);
  for (let k = 0; k < name.length; k++) luni.u16(name.charCodeAt(k));
  while (luni.size % 4) luni.u8(0);
  extra.ascii("8BIMluni");
  extra.u32(luni.size);
  for (const c of luni.chunks) extra.push(c);
  extra.ascii("8BIMlyid");
  extra.u32(4);
  extra.u32(id);
  b.u32(extra.size);
  for (const c of extra.chunks) b.push(c);
  return b;
}

export function buildLinePsd(opts: {
  width: number;
  height: number;
  dpi: number;
  sketch: Uint8ClampedArray; // RGBA
  line: Uint8ClampedArray; // RGBA, transparent around the lines
  path: Uint8Array; // Photoshop path records (see render.ts)
}): Blob {
  const { width: w, height: h, dpi, sketch, line, path } = opts;
  const out = new Bytes();
  out.ascii("8BPS");
  out.u16(1);
  out.u8(0, 0, 0, 0, 0, 0);
  out.u16(3);
  out.u32(h);
  out.u32(w);
  out.u16(8);
  out.u16(3); // RGB
  out.u32(0); // no colour mode data

  const res = new Bytes();
  // 1005: resolution
  res.ascii("8BIM");
  res.u16(1005);
  res.u16(0); // empty name, padded
  res.u32(16);
  res.u32(Math.round(dpi * 65536));
  res.u16(1);
  res.u16(2);
  res.u32(Math.round(dpi * 65536));
  res.u16(1);
  res.u16(2);
  // 2000: the saved path
  const pname = "Line art";
  res.ascii("8BIM");
  res.u16(2000);
  res.u8(pname.length);
  res.ascii(pname);
  if ((pname.length + 1) % 2) res.u8(0);
  res.u32(path.length);
  res.push(path);
  if (path.length % 2) res.u8(0);
  out.u32(res.size);
  for (const c of res.chunks) out.push(c);

  // Layers, bottom first: the sketch, then the lines.
  const sketchCh = [3, 0, 1, 2].map((c) => encodeChannel(plane(sketch, c, w, h), w, h));
  const lineCh = [3, 0, 1, 2].map((c) => encodeChannel(plane(line, c, w, h), w, h));
  const info = new Bytes();
  info.u16(2);
  for (const c of layerRecord("Phác thảo", "Phac thao", w, h, sketchCh.map((x) => x.length), 1, 255).chunks) info.push(c);
  for (const c of layerRecord("Line", "Line", w, h, lineCh.map((x) => x.length), 2, 255).chunks) info.push(c);
  for (const c of sketchCh) info.push(c);
  for (const c of lineCh) info.push(c);
  while (info.size % 4) info.u8(0);
  out.u32(4 + info.size + 4);
  out.u32(info.size);
  for (const c of info.chunks) out.push(c);
  out.u32(0); // no global layer mask

  // Flattened picture (what viewers without layers show): lines over sketch.
  const flat = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = line[i * 4 + 3] / 255;
    const sa = sketch[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const under = 255 * (1 - sa) + sketch[i * 4 + c] * sa;
      flat[i * 4 + c] = under * (1 - a) + line[i * 4 + c] * a;
    }
  }
  const planes = [0, 1, 2].map((c) => encodeChannel(plane(flat, c, w, h), w, h));
  out.u16(1); // RLE
  for (const p of planes) out.push(p.subarray(2, 2 + h * 2));
  for (const p of planes) out.push(p.subarray(2 + h * 2));
  return new Blob(out.chunks as BlobPart[], { type: "image/vnd.adobe.photoshop" });
}
