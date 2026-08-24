// Sinh file SVG khung kích thước (template) — mở trực tiếp trong
// Illustrator/Photoshop/Procreate làm lớp nền để vẽ đúng khổ, đúng tràn lề,
// đúng gáy. Đơn vị trong SVG là inch thật (width="...in"), nên mở ra là đúng
// tỉ lệ 1:1 khi in.

import {
  BARCODE_HEIGHT_IN,
  BARCODE_MARGIN_IN,
  BARCODE_WIDTH_IN,
  BLEED_IN,
  InteriorType,
  MARGIN_IN,
  OUTER_MARGIN_IN,
  PaperType,
  ReadingDirection,
  SPINE_MARGIN_IN,
  coverSizes,
  gutterMarginIn,
  interiorSizes,
} from "@/lib/bookSize";

const FONT_SIZE = 0.13;

function text(x: number, y: number, content: string, opts: { anchor?: "start" | "middle" | "end"; size?: number } = {}) {
  const anchor = opts.anchor ?? "middle";
  const size = opts.size ?? FONT_SIZE;
  return `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" font-size="${size}" font-family="Arial, sans-serif" text-anchor="${anchor}" fill="#1a1a1a">${content}</text>`;
}

function rect(x: number, y: number, w: number, h: number, stroke: string, dash?: string) {
  return `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" fill="none" stroke="${stroke}" stroke-width="0.02" ${
    dash ? `stroke-dasharray="${dash}"` : ""
  } />`;
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: string, dash?: string) {
  return `<line x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}" stroke="${stroke}" stroke-width="0.02" ${
    dash ? `stroke-dasharray="${dash}"` : ""
  } />`;
}

function wrap(width: number, height: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(3)}in" height="${height.toFixed(3)}in" viewBox="0 0 ${width.toFixed(3)} ${height.toFixed(3)}">
<rect x="0" y="0" width="${width.toFixed(3)}" height="${height.toFixed(3)}" fill="#ffffff" stroke="#c9c9c9" stroke-width="0.02" />
${body}
</svg>`;
}

export function interiorTemplateSvg(trim: { width: number; height: number }, pageCount: number, bleed: boolean) {
  const { trimW, trimH, fileW, fileH } = interiorSizes(trim, bleed);
  const offsetX = bleed ? BLEED_IN : 0; // gáy (trong) không tràn lề
  const offsetY = bleed ? BLEED_IN : 0;
  const gutter = gutterMarginIn(pageCount);

  const parts: string[] = [];
  // Khổ xén (trim) — nét đứt đen
  parts.push(rect(offsetX, offsetY, trimW, trimH, "#1a1a1a", "0.06,0.06"));
  // Vùng an toàn — nét chấm xanh (gáy rộng hơn 3 cạnh còn lại)
  parts.push(
    rect(
      offsetX + gutter,
      offsetY + OUTER_MARGIN_IN,
      trimW - gutter - OUTER_MARGIN_IN,
      trimH - OUTER_MARGIN_IN * 2,
      "#2f6fed",
      "0.02,0.05",
    ),
  );
  parts.push(text(offsetX + trimW / 2, offsetY - 0.06, `Trang xén ${trimW.toFixed(3)} × ${trimH.toFixed(3)} in`));
  parts.push(text(offsetX + 0.05, offsetY + trimH / 2, "GÁY", { anchor: "start", size: 0.1 }));
  if (bleed) {
    parts.push(text(fileW / 2, fileH - 0.06, `Tràn lề (bleed) 0.125in — ngoài/trên/dưới`, { size: 0.1 }));
  }

  return wrap(fileW, fileH, parts.join("\n"));
}

export function coverTemplateSvg(
  trim: { width: number; height: number },
  pageCount: number,
  interiorType: InteriorType,
  paperType: PaperType,
  readingDirection: ReadingDirection = "ltr",
) {
  const cover = coverSizes(trim, pageCount, interiorType, paperType);
  const { spine, trimTotalW, trimTotalH, fileW, fileH } = cover;
  const ox = BLEED_IN;
  const oy = BLEED_IN;
  // Sách đọc phải-sang-trái (vd. truyện kiểu manga) thì bìa trước nằm bên
  // trái của bìa gộp thay vì bên phải.
  const rtl = readingDirection === "rtl";
  const backX = rtl ? ox + trim.width + spine.w : ox;
  const frontX = rtl ? ox : ox + trim.width + spine.w;
  const spineX = ox + trim.width;

  const parts: string[] = [];
  // Khổ xén toàn bìa — nét đứt đen
  parts.push(rect(ox, oy, trimTotalW, trimTotalH, "#1a1a1a", "0.06,0.06"));
  // Ranh giới gáy
  parts.push(line(spineX, oy, spineX, oy + trimTotalH, "#1a1a1a"));
  parts.push(line(spineX + spine.w, oy, spineX + spine.w, oy + trimTotalH, "#1a1a1a"));
  // Vùng an toàn bìa trước/sau — lề 0.125in trên/dưới + cạnh ngoài (không
  // trừ ở cạnh giáp gáy) — nét chấm xanh
  parts.push(rect(backX, oy + MARGIN_IN, trim.width - MARGIN_IN, trimTotalH - MARGIN_IN * 2, "#2f6fed", "0.02,0.05"));
  parts.push(
    rect(frontX + MARGIN_IN, oy + MARGIN_IN, trim.width - MARGIN_IN, trimTotalH - MARGIN_IN * 2, "#2f6fed", "0.02,0.05"),
  );
  // Vùng chữ an toàn trên gáy — nét chấm đỏ, chỉ vẽ nếu gáy đủ rộng
  if (cover.spineSafeArea.w > 0) {
    parts.push(
      rect(spineX + SPINE_MARGIN_IN, oy + MARGIN_IN, cover.spineSafeArea.w, cover.spineSafeArea.h, "#e0483e", "0.02,0.05"),
    );
  }
  // Vùng chừa mã vạch ISBN (Amazon tự chèn) — góc trong bìa sau
  const barcodeX = backX + trim.width - BARCODE_MARGIN_IN - BARCODE_WIDTH_IN;
  const barcodeY = oy + trimTotalH - BARCODE_MARGIN_IN - BARCODE_HEIGHT_IN;
  parts.push(rect(barcodeX, barcodeY, BARCODE_WIDTH_IN, BARCODE_HEIGHT_IN, "#9a6b00", "0.03,0.03"));
  parts.push(text(barcodeX + BARCODE_WIDTH_IN / 2, barcodeY + BARCODE_HEIGHT_IN / 2, "MÃ VẠCH", { size: 0.09 }));

  parts.push(text(backX + trim.width / 2, oy - 0.06, "BÌA SAU"));
  parts.push(text(frontX + trim.width / 2, oy - 0.06, "BÌA TRƯỚC"));
  parts.push(text(spineX + spine.w / 2, oy + trimTotalH / 2, spine.w >= 0.25 ? "GÁY" : "", { size: 0.09 }));
  parts.push(text(fileW / 2, fileH - 0.06, `Gáy ${spine.w.toFixed(3)} in — Tràn lề 0.125in quanh 4 cạnh ngoài`, { size: 0.1 }));

  return wrap(fileW, fileH, parts.join("\n"));
}

export function downloadSvg(svg: string, fileName: string) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPng(svg: string, widthIn: number, heightIn: number, dpi: number, fileName: string) {
  const img = new Image();
  const svgBlob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(widthIn * dpi);
    canvas.height = Math.round(heightIn * dpi);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, "image/png");
    }
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
