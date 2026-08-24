// One-off utility: pulls the single embedded JPEG out of a PDF whose only
// content is one full-page photo (DCTDecode stream) — used to turn the
// staff portrait PDFs from Google Drive into real image files for avatars.
const fs = require("fs");

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: node extract-pdf-jpeg.js <input.pdf> <output.jpg>");
  process.exit(1);
}

const buf = fs.readFileSync(inputPath);
const text = buf.toString("latin1");

const dctIndex = text.indexOf("DCTDecode");
if (dctIndex === -1) {
  console.error("No DCTDecode (JPEG) stream found in " + inputPath);
  process.exit(2);
}

// Look backwards from the filter for this object's /Length value.
const dictStart = text.lastIndexOf("obj", dctIndex);
const dict = text.slice(dictStart, dctIndex + 200);
const lengthMatch = dict.match(/\/Length\s+(\d+)/);
if (!lengthMatch) {
  console.error("Could not find /Length near DCTDecode stream");
  process.exit(3);
}
const length = parseInt(lengthMatch[1], 10);

const streamKeywordIndex = text.indexOf("stream", dctIndex);
let dataStart = streamKeywordIndex + "stream".length;
// Stream data starts right after the EOL following the "stream" keyword.
if (buf[dataStart] === 0x0d) dataStart++;
if (buf[dataStart] === 0x0a) dataStart++;

const jpegBytes = buf.subarray(dataStart, dataStart + length);
if (jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
  console.error("Extracted bytes don't start with a JPEG SOI marker — extraction likely wrong");
  process.exit(4);
}

fs.writeFileSync(outputPath, jpegBytes);
console.log("Wrote " + outputPath + " (" + jpegBytes.length + " bytes)");
