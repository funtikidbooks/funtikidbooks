// Picks the layers of a Photoshop file to convert — a sticker sheet keeps its
// die lines on layers of their own, so they can be taken without the art.
import { parsePsd, readChannel, type PsdFile } from "../sticker/psd";

export type LayerChoice = { index: number; name: string; hidden: boolean; w: number; h: number };

export function listLayers(bytes: Uint8Array): { psd: PsdFile; layers: LayerChoice[] } {
  const psd = parsePsd(bytes);
  const layers = psd.layers
    .filter((l) => l.section === 0 && l.right > l.left && l.bottom > l.top)
    .map((l) => ({ index: l.index, name: l.name.normalize("NFC"), hidden: l.hidden, w: l.right - l.left, h: l.bottom - l.top }))
    .reverse(); // top layer first, as Photoshop shows them
  return { psd, layers };
}

// The chosen layers stacked on a transparent page the size of the document.
export function composeLayers(psd: PsdFile, indices: number[]): { rgba: Uint8ClampedArray<ArrayBuffer>; width: number; height: number; dpi: number } {
  const { width, height } = psd;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const cmyk = psd.mode === 4;
  const chosen = new Set(indices);
  for (const layer of psd.layers) {
    if (!chosen.has(layer.index) || layer.section !== 0) continue;
    const lw = layer.right - layer.left;
    const lh = layer.bottom - layer.top;
    if (lw <= 0 || lh <= 0) continue;
    const alpha = readChannel(psd, layer, -1);
    const c0 = readChannel(psd, layer, 0);
    const c1 = readChannel(psd, layer, 1);
    const c2 = readChannel(psd, layer, 2);
    const c3 = cmyk ? readChannel(psd, layer, 3) : null;
    if (!c0 || !c1 || !c2) continue;
    for (let y = 0; y < lh; y++) {
      const py = layer.top + y;
      if (py < 0 || py >= height) continue;
      for (let x = 0; x < lw; x++) {
        const px = layer.left + x;
        if (px < 0 || px >= width) continue;
        const i = y * lw + x;
        const sa = (alpha ? alpha[i] : 255) / 255;
        if (sa === 0) continue;
        let r: number;
        let g: number;
        let b: number;
        if (cmyk) {
          const k = (c3 ? c3[i] : 255) / 255; // stored inverted: 255 = no ink
          r = c0[i] * k;
          g = c1[i] * k;
          b = c2[i] * k;
        } else {
          r = c0[i];
          g = c1[i];
          b = c2[i];
        }
        const o = (py * width + px) * 4;
        const da = rgba[o + 3] / 255;
        const a = sa + da * (1 - sa);
        rgba[o] = (r * sa + rgba[o] * da * (1 - sa)) / a;
        rgba[o + 1] = (g * sa + rgba[o + 1] * da * (1 - sa)) / a;
        rgba[o + 2] = (b * sa + rgba[o + 2] * da * (1 - sa)) / a;
        rgba[o + 3] = a * 255;
      }
    }
  }
  return { rgba, width, height, dpi: psd.dpi };
}
