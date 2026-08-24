import { fontFamilyFor } from "@/lib/fontFormat";
import type { EditorLayer, FontAsset } from "@/lib/types";

const loadedFontIds = new Set<string>();

async function ensureFontLoaded(font: FontAsset) {
  if (loadedFontIds.has(font.id)) return;
  const face = new FontFace(fontFamilyFor(font), `url(${font.file_url})`);
  await face.load();
  document.fonts.add(face);
  loadedFontIds.add(font.id);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: "left" | "center" | "right",
) {
  const anchorX = align === "center" ? x + maxWidth / 2 : align === "right" ? x + maxWidth : x;
  let cursorY = y;
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const attempt = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(attempt).width > maxWidth) {
        ctx.fillText(line, anchorX, cursorY);
        cursorY += lineHeight;
        line = word;
      } else {
        line = attempt;
      }
    }
    ctx.fillText(line, anchorX, cursorY);
    cursorY += lineHeight;
  }
}

export async function exportEditorPng(
  background: { url: string; width: number; height: number },
  layers: EditorLayer[],
  fonts: FontAsset[],
  fileName: string,
) {
  const bgImage = await loadImage(background.url);
  const canvas = document.createElement("canvas");
  canvas.width = background.width;
  canvas.height = background.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không thể xuất ảnh");

  ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

  for (const layer of layers) {
    if (layer.type === "image") {
      const img = await loadImage(layer.src);
      ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
    } else {
      const font = layer.fontId ? fonts.find((f) => f.id === layer.fontId) : undefined;
      let family = "Arial, sans-serif";
      if (font) {
        await ensureFontLoaded(font);
        family = `"${fontFamilyFor(font)}", Arial, sans-serif`;
      }
      ctx.fillStyle = layer.color;
      ctx.textAlign = layer.align;
      ctx.textBaseline = "top";
      ctx.font = `${layer.bold ? "bold " : ""}${layer.fontSize}px ${family}`;
      drawWrappedText(ctx, layer.text, layer.x, layer.y, layer.width, layer.fontSize * 1.25, layer.align);
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Không thể xuất ảnh");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
