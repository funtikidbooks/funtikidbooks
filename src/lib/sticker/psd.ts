// Just enough of the Photoshop format to read a sticker sheet's layers and
// write the same file back with extra layers slipped in. Every original
// layer is copied byte for byte (effects, masks, smart objects and all), so
// nothing the artist made is touched — only new layers are added (and the
// tool's own layers from an earlier download left out, to be made afresh).
// Handles 8-bit RGB and CMYK .psd (not .psb). In CMYK files Photoshop
// stores each ink inverted: 255 = no ink, 0 = full ink.

export type PsdLayer = {
  index: number; // position in the file's layer list, 0 = bottom
  name: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
  channels: { id: number; offset: number; length: number }[];
  recordStart: number;
  recordEnd: number;
  dataStart: number;
  dataEnd: number;
  opacity: number;
  clipping: boolean;
  hidden: boolean; // own flag or any enclosing group hidden
  section: number; // 0 layer, 1/2 group, 3 end-of-group marker
  layerId: number;
  groupPath: string[];
};

export type PsdFile = {
  buf: Uint8Array;
  width: number;
  height: number;
  mode: 3 | 4; // 3 RGB, 4 CMYK
  dpi: number;
  layers: PsdLayer[];
  negativeCount: boolean;
  layerMaskStart: number; // offset of the layer & mask section's length field
  layerInfoEnd: number;
  layerMaskEnd: number;
};

export type NewLayer = {
  name: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
  // Already PackBits-encoded (see encodeChannel), one per channel id.
  channels: { id: number; data: Uint8Array }[];
};

const dec = new TextDecoder("latin1");

function sigAt(b: Uint8Array, p: number) {
  return dec.decode(b.subarray(p, p + 4));
}

export function parsePsd(buf: Uint8Array): PsdFile {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (sigAt(buf, 0) !== "8BPS") throw new Error("Đây không phải file Photoshop (.psd).");
  if (dv.getUint16(4) !== 1) throw new Error("File .psb (khổ cực lớn) chưa hỗ trợ — lưu lại dạng .psd.");
  const height = dv.getUint32(14);
  const width = dv.getUint32(18);
  const depth = dv.getUint16(22);
  const mode = dv.getUint16(24);
  if (depth !== 8) throw new Error("File cần ở chế độ 8 bit/kênh (Image → Mode → 8 Bits/Channel).");
  if (mode !== 3 && mode !== 4) throw new Error("File cần ở hệ màu CMYK hoặc RGB.");

  let p = 26;
  p += 4 + dv.getUint32(p); // color mode data
  const resLen = dv.getUint32(p);
  let dpi = 300;
  for (let r = p + 4; r < p + 4 + resLen; ) {
    if (sigAt(buf, r) !== "8BIM") break;
    const id = dv.getUint16(r + 4);
    const nameLen = buf[r + 6];
    let q = r + 6 + ((nameLen + 2) & ~1);
    const size = dv.getUint32(q);
    q += 4;
    if (id === 1005) dpi = dv.getUint32(q) / 65536 || 300;
    r = q + size + (size & 1);
  }
  p += 4 + resLen;

  const layerMaskStart = p;
  const layerMaskEnd = p + 4 + dv.getUint32(p);
  const liLen = dv.getUint32(p + 4);
  const liStart = p + 8;
  const layerInfoEnd = liStart + liLen;
  if (liLen === 0) throw new Error("File không có lớp (layer) nào để tạo viền.");

  const rawCount = dv.getInt16(liStart);
  const count = Math.abs(rawCount);
  const layers: PsdLayer[] = [];
  p = liStart + 2;
  for (let i = 0; i < count; i++) {
    const recordStart = p;
    const top = dv.getInt32(p);
    const left = dv.getInt32(p + 4);
    const bottom = dv.getInt32(p + 8);
    const right = dv.getInt32(p + 12);
    const nch = dv.getUint16(p + 16);
    p += 18;
    const channels: PsdLayer["channels"] = [];
    for (let c = 0; c < nch; c++) {
      channels.push({ id: dv.getInt16(p), offset: 0, length: dv.getUint32(p + 2) });
      p += 6;
    }
    p += 8; // '8BIM' + blend mode
    const opacity = buf[p];
    const clipping = buf[p + 1] === 1;
    const flags = buf[p + 2];
    p += 4;
    const extraLen = dv.getUint32(p);
    const extraStart = p + 4;
    const extraEnd = extraStart + extraLen;
    p = extraStart;
    p += 4 + dv.getUint32(p); // layer mask data
    p += 4 + dv.getUint32(p); // blending ranges
    const pascalLen = buf[p];
    let name = dec.decode(buf.subarray(p + 1, p + 1 + pascalLen));
    p += (pascalLen + 4) & ~3;
    let section = 0;
    let layerId = 0;
    while (p + 12 <= extraEnd) {
      // Blocks are padded inconsistently between writers — step to the next signature.
      let s = sigAt(buf, p);
      let guard = 0;
      while (s !== "8BIM" && s !== "8B64" && guard < 4 && p + 12 <= extraEnd) {
        p++;
        guard++;
        s = sigAt(buf, p);
      }
      if (s !== "8BIM" && s !== "8B64") break;
      const key = sigAt(buf, p + 4);
      const len = dv.getUint32(p + 8);
      const d = p + 12;
      if (key === "luni") {
        const n = dv.getUint32(d);
        let str = "";
        for (let k = 0; k < n; k++) str += String.fromCharCode(dv.getUint16(d + 4 + k * 2));
        name = str.replace(/\0+$/, "");
      } else if (key === "lsct" || key === "lsdk") {
        section = dv.getUint32(d);
      } else if (key === "lyid") {
        layerId = dv.getUint32(d);
      }
      p = d + len;
    }
    p = extraEnd;
    layers.push({
      index: i,
      name,
      top,
      left,
      bottom,
      right,
      channels,
      recordStart,
      recordEnd: extraEnd,
      dataStart: 0,
      dataEnd: 0,
      opacity,
      clipping,
      hidden: (flags & 2) !== 0,
      section,
      layerId,
      groupPath: [],
    });
  }
  for (const l of layers) {
    l.dataStart = p;
    for (const c of l.channels) {
      c.offset = p;
      p += c.length;
    }
    l.dataEnd = p;
  }

  // Groups: walking top → bottom, a folder record opens a group and the
  // end-of-group marker closes it. Hidden groups hide everything inside.
  const stack: { name: string; hidden: boolean }[] = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.section === 1 || l.section === 2) {
      l.groupPath = stack.map((g) => g.name);
      const hidden = l.hidden || stack.some((g) => g.hidden);
      stack.push({ name: l.name, hidden });
      l.hidden = hidden;
    } else if (l.section === 3) {
      stack.pop();
    } else {
      l.groupPath = stack.map((g) => g.name);
      l.hidden = l.hidden || stack.some((g) => g.hidden);
    }
  }

  return {
    buf,
    width,
    height,
    mode: mode as 3 | 4,
    dpi,
    layers,
    negativeCount: rawCount < 0,
    layerMaskStart,
    layerInfoEnd,
    layerMaskEnd,
  };
}

// One channel's pixels (w×h, 0–255). Null for channels that aren't layer
// pixels (user masks are sized to the mask, not the layer).
export function readChannel(psd: PsdFile, layer: PsdLayer, id: number): Uint8Array | null {
  const ch = layer.channels.find((c) => c.id === id);
  if (!ch) return null;
  const w = layer.right - layer.left;
  const h = layer.bottom - layer.top;
  const out = new Uint8Array(w * h);
  if (w <= 0 || h <= 0) return out;
  const b = psd.buf;
  const comp = (b[ch.offset] << 8) | b[ch.offset + 1];
  const start = ch.offset + 2;
  if (comp === 0) {
    out.set(b.subarray(start, start + w * h));
  } else if (comp === 1) {
    let src = start + h * 2;
    let dst = 0;
    for (let y = 0; y < h; y++) {
      const rowLen = (b[start + y * 2] << 8) | b[start + y * 2 + 1];
      const end = src + rowLen;
      const rowEnd = (y + 1) * w;
      while (src < end && dst < rowEnd) {
        const n = b[src++];
        if (n < 128) {
          for (let k = 0; k <= n; k++) out[dst++] = b[src++];
        } else if (n > 128) {
          const v = b[src++];
          for (let k = 0; k < 257 - n; k++) out[dst++] = v;
        }
      }
      src = end;
      dst = rowEnd;
    }
  } else {
    throw new Error("Lớp “" + layer.name + "” lưu ở dạng nén ZIP — lưu lại file với tuỳ chọn mặc định của Photoshop.");
  }
  return out;
}

// PackBits, one row at a time, with the per-row byte counts Photoshop wants
// in front.
export function encodeChannel(px: Uint8Array, w: number, h: number): Uint8Array {
  const rows: Uint8Array[] = [];
  let total = 2 + h * 2;
  const tmp = new Uint8Array(w * 2 + 16);
  for (let y = 0; y < h; y++) {
    const row = px.subarray(y * w, y * w + w);
    let o = 0;
    let i = 0;
    while (i < w) {
      let run = 1;
      while (i + run < w && run < 128 && row[i + run] === row[i]) run++;
      if (run >= 3) {
        tmp[o++] = 257 - run;
        tmp[o++] = row[i];
        i += run;
      } else {
        let lit = 0;
        while (i + lit < w && lit < 128) {
          if (i + lit + 2 < w && row[i + lit] === row[i + lit + 1] && row[i + lit] === row[i + lit + 2]) break;
          lit++;
        }
        tmp[o++] = lit - 1;
        for (let k = 0; k < lit; k++) tmp[o++] = row[i + k];
        i += lit;
      }
    }
    rows.push(tmp.slice(0, o));
    total += o;
  }
  const out = new Uint8Array(total);
  out[0] = 0;
  out[1] = 1;
  let p = 2 + h * 2;
  rows.forEach((r, y) => {
    out[2 + y * 2] = r.length >> 8;
    out[3 + y * 2] = r.length & 255;
    out.set(r, p);
    p += r.length;
  });
  return out;
}

class Writer {
  chunks: Uint8Array[] = [];
  size = 0;
  bytes(b: Uint8Array) {
    this.chunks.push(b);
    this.size += b.length;
  }
  u8(...v: number[]) {
    this.bytes(Uint8Array.from(v));
  }
  u16(v: number) {
    this.u8((v >> 8) & 255, v & 255);
  }
  i16(v: number) {
    this.u16(v & 0xffff);
  }
  u32(v: number) {
    this.u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  }
  i32(v: number) {
    this.u32(v >>> 0);
  }
  ascii(s: string) {
    this.bytes(Uint8Array.from(s, (c) => c.charCodeAt(0) & 255));
  }
  concat(): Uint8Array {
    const out = new Uint8Array(this.size);
    let p = 0;
    for (const c of this.chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }
}

function newLayerRecord(l: NewLayer, id: number): Uint8Array {
  const w = new Writer();
  w.i32(l.top);
  w.i32(l.left);
  w.i32(l.bottom);
  w.i32(l.right);
  w.u16(l.channels.length);
  for (const c of l.channels) {
    w.i16(c.id);
    w.u32(c.data.length);
  }
  w.ascii("8BIMnorm");
  w.u8(255, 0, 0x08, 0); // opacity, clipping, flags, filler

  const extra = new Writer();
  extra.u32(0); // no layer mask
  extra.u32(0); // no blending ranges
  const ascii = l.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^\x20-\x7e]/g, "").slice(0, 255);
  extra.u8(ascii.length);
  extra.ascii(ascii);
  for (let pad = (ascii.length + 1) % 4; pad && pad < 4; pad++) extra.u8(0);
  // Full Vietnamese name
  const luni = new Writer();
  luni.u32(l.name.length);
  for (let k = 0; k < l.name.length; k++) luni.u16(l.name.charCodeAt(k));
  while (luni.size % 4) luni.u8(0);
  extra.ascii("8BIMluni");
  extra.u32(luni.size);
  extra.bytes(luni.concat());
  extra.ascii("8BIMlyid");
  extra.u32(4);
  extra.u32(id);

  w.u32(extra.size);
  w.bytes(extra.concat());
  return w.concat();
}

// The original file with `below[i]` layers placed directly under layer i
// (so they sit in the same group), `onTop` above everything, and the layers
// in `drop` left out.
export function writePsdWithLayers(
  psd: PsdFile,
  below: Map<number, NewLayer[]>,
  onTop: NewLayer[],
  drop: Set<number> = new Set(),
): Blob {
  const b = psd.buf;
  let nextId = Math.max(0, ...psd.layers.map((l) => l.layerId)) + 1;
  const records = new Writer();
  const data = new Writer();
  let count = 0;
  const addNew = (l: NewLayer) => {
    records.bytes(newLayerRecord(l, nextId++));
    for (const c of l.channels) data.bytes(c.data);
    count++;
  };
  for (const l of psd.layers) {
    for (const n of below.get(l.index) ?? []) addNew(n);
    if (drop.has(l.index)) continue;
    records.bytes(b.subarray(l.recordStart, l.recordEnd));
    data.bytes(b.subarray(l.dataStart, l.dataEnd));
    count++;
  }
  for (const n of onTop) addNew(n);

  const info = new Writer();
  info.i16(psd.negativeCount ? -count : count);
  for (const c of records.chunks) info.bytes(c);
  for (const c of data.chunks) info.bytes(c);
  while (info.size % 4) info.u8(0);

  const tail = b.subarray(psd.layerInfoEnd, psd.layerMaskEnd); // global mask + extra blocks
  const out = new Writer();
  out.bytes(b.subarray(0, psd.layerMaskStart));
  out.u32(4 + info.size + tail.length);
  out.u32(info.size);
  for (const c of info.chunks) out.bytes(c);
  out.bytes(tail);
  out.bytes(b.subarray(psd.layerMaskEnd)); // flattened image, unchanged
  return new Blob(out.chunks as BlobPart[], { type: "image/vnd.adobe.photoshop" });
}
