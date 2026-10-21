// Opens a sketch file in the browser: PNG/JPG (with its dpi when the file
// says) or a Photoshop file's flattened picture.

export type SketchImage = { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer>; dpi: number | null };

function jpegDpi(b: Uint8Array): number | null {
  // JFIF APP0: density units 1 = dots per inch, 2 = per cm.
  for (let i = 2; i + 18 < b.length && i < 4096; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xe0 && b[i + 4] === 0x4a && b[i + 5] === 0x46 && b[i + 6] === 0x49 && b[i + 7] === 0x46) {
      const units = b[i + 11];
      const x = (b[i + 12] << 8) | b[i + 13];
      if (units === 1 && x > 30) return x;
      if (units === 2 && x > 10) return Math.round(x * 2.54);
      return null;
    }
    i += 2 + len;
  }
  return null;
}

function pngDpi(b: Uint8Array): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let p = 8; p + 12 < b.length; ) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    if (type === "pHYs") {
      const ppm = dv.getUint32(p + 8);
      return b[p + 16] === 1 && ppm > 1000 ? Math.round(ppm * 0.0254) : null;
    }
    if (type === "IDAT") return null;
    p += 12 + len;
  }
  return null;
}

// The flattened image Photoshop saves after the layers ("Maximize
// compatibility" — on by default).
function psdComposite(b: Uint8Array): SketchImage {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== "8BPS") throw new Error("File Photoshop bị lỗi.");
  if (dv.getUint16(4) !== 1) throw new Error("File .psb chưa hỗ trợ — lưu lại dạng .psd hoặc xuất PNG.");
  const channels = dv.getUint16(12);
  const height = dv.getUint32(14);
  const width = dv.getUint32(18);
  const depth = dv.getUint16(22);
  const mode = dv.getUint16(24);
  if (depth !== 8) throw new Error("File cần ở chế độ 8 bit/kênh.");
  if (mode !== 3 && mode !== 4 && mode !== 1) throw new Error("File cần ở hệ màu RGB, CMYK hoặc Grayscale.");
  let p = 26;
  p += 4 + dv.getUint32(p);
  const resLen = dv.getUint32(p);
  let dpi: number | null = null;
  for (let r = p + 4; r < p + 4 + resLen; ) {
    if (String.fromCharCode(b[r], b[r + 1], b[r + 2], b[r + 3]) !== "8BIM") break;
    const id = dv.getUint16(r + 4);
    let q = r + 6 + ((b[r + 6] + 2) & ~1);
    const size = dv.getUint32(q);
    q += 4;
    if (id === 1005) dpi = Math.round(dv.getUint32(q) / 65536) || null;
    r = q + size + (size & 1);
  }
  p += 4 + resLen;
  p += 4 + dv.getUint32(p);
  const comp = dv.getUint16(p);
  p += 2;
  const n = width * height;
  const planes: Uint8Array[] = [];
  const used = Math.min(channels, mode === 4 ? 4 : mode === 3 ? 3 : 1);
  if (comp === 0) {
    for (let c = 0; c < used; c++) planes.push(b.subarray(p + c * n, p + (c + 1) * n));
  } else if (comp === 1) {
    const counts = p;
    let src = p + channels * height * 2;
    for (let c = 0; c < channels; c++) {
      const out = new Uint8Array(n);
      for (let y = 0; y < height; y++) {
        const len = dv.getUint16(counts + (c * height + y) * 2);
        const end = src + len;
        let dst = y * width;
        const rowEnd = dst + width;
        while (src < end && dst < rowEnd) {
          const k = b[src++];
          if (k < 128) {
            for (let j = 0; j <= k; j++) out[dst++] = b[src++];
          } else if (k > 128) {
            const v = b[src++];
            for (let j = 0; j < 257 - k; j++) out[dst++] = v;
          }
        }
        src = end;
      }
      if (c < used) planes.push(out);
    }
  } else {
    throw new Error("File Photoshop nén ZIP — xuất PNG giúp hoặc lưu lại với tuỳ chọn mặc định.");
  }
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    if (mode === 4) {
      // stored inverted: 255 = no ink
      const k = planes[3][i] / 255;
      rgba[i * 4] = planes[0][i] * k;
      rgba[i * 4 + 1] = planes[1][i] * k;
      rgba[i * 4 + 2] = planes[2][i] * k;
    } else if (mode === 3) {
      rgba[i * 4] = planes[0][i];
      rgba[i * 4 + 1] = planes[1][i];
      rgba[i * 4 + 2] = planes[2][i];
    } else {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = planes[0][i];
    }
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba, dpi };
}

export async function readSketch(file: File): Promise<SketchImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.psd$/i.test(file.name) || (bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53)) {
    return psdComposite(bytes);
  }
  const dpi = bytes[0] === 0xff && bytes[1] === 0xd8 ? jpegDpi(bytes) : bytes[0] === 0x89 && bytes[1] === 0x50 ? pngDpi(bytes) : null;
  const bmp = await createImageBitmap(new Blob([bytes]));
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  bmp.close();
  return { width: canvas.width, height: canvas.height, rgba: data, dpi };
}
