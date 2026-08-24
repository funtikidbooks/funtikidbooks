// Companion to extract-pdf-jpeg.js — for a PDF whose embedded image is raw
// DeviceRGB pixel data (FlateDecode, no JPEG), e.g. exported from Clip
// Studio Paint. Inflates the stream and re-encodes it as a plain PNG.
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: node extract-pdf-rawrgb.js <input.pdf> <output.png>");
  process.exit(1);
}

const buf = fs.readFileSync(inputPath);
const text = buf.toString("latin1");

const imgIdx = text.search(/\/Subtype\s*\/Image/);
if (imgIdx === -1) {
  console.error("No image XObject found");
  process.exit(2);
}
const dictStart = text.lastIndexOf("obj", imgIdx);
const streamKeywordIndex = text.indexOf("stream", imgIdx);
const dict = text.slice(dictStart, streamKeywordIndex);

const width = parseInt(dict.match(/\/Width\s+(\d+)/)[1], 10);
const height = parseInt(dict.match(/\/Height\s+(\d+)/)[1], 10);
const bpc = parseInt(dict.match(/\/BitsPerComponent\s+(\d+)/)?.[1] ?? "8", 10);
const length = parseInt(dict.match(/\/Length\s+(\d+)/)[1], 10);
if (bpc !== 8) {
  console.error("Only 8-bit-per-component images are supported, got " + bpc);
  process.exit(3);
}

let dataStart = streamKeywordIndex + "stream".length;
if (buf[dataStart] === 0x0d) dataStart++;
if (buf[dataStart] === 0x0a) dataStart++;

const compressed = buf.subarray(dataStart, dataStart + length);
const raw = zlib.inflateSync(compressed); // width*height*3 bytes, DeviceRGB

function crc32(bytes) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Prefix every scanline with a filter byte (0 = None) — what PNG's IDAT
// stream expects, distinct from the PDF's own (unfiltered) raw bytes.
const stride = width * 3;
const filtered = Buffer.alloc((stride + 1) * height);
for (let y = 0; y < height; y++) {
  filtered[y * (stride + 1)] = 0;
  raw.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
}
const idatData = zlib.deflateSync(filtered);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type 2 = truecolor (RGB)
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = Buffer.concat([
  signature,
  chunk("IHDR", ihdr),
  chunk("IDAT", idatData),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.writeFileSync(outputPath, png);
console.log("Wrote " + outputPath + " (" + png.length + " bytes), " + width + "x" + height);
