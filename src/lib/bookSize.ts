// Kích thước khổ sách + bìa gộp, theo đúng cấu trúc & công thức của Cover
// Calculator (Amazon KDP): trang xén (trim) + tràn lề (bleed) 0.125in, gáy
// sách tính từ số trang × độ dày giấy/trang, bìa gộp = bìa trước + gáy + bìa
// sau + tràn lề, cùng vùng an toàn/lề gáy/lề mã vạch. Các hằng số margin
// (0.125in bìa, 0.0625in gáy, 0.25in mã vạch) được đối chiếu ngược từ ví dụ
// số liệu thật trên công cụ KDP (khổ 5×8in, 86 trang, giấy trắng, màu tiêu
// chuẩn) — không phải suy đoán. Đây vẫn là công cụ ước tính nội bộ để dựng
// khung vẽ nhanh; trước khi gửi file in thật, luôn đối chiếu lại với Cover
// Calculator chính thức của KDP.

export type Binding = "paperback" | "hardcover";

export type ReadingDirection = "ltr" | "rtl";

export type TrimSize = {
  label: string;
  width: number; // inch
  height: number; // inch
  hardcover?: boolean;
};

export const TRIM_SIZES: TrimSize[] = [
  { label: "5 × 8 in", width: 5, height: 8 },
  { label: "5.06 × 7.81 in", width: 5.06, height: 7.81 },
  { label: "5.25 × 8 in", width: 5.25, height: 8 },
  { label: "5.5 × 8.5 in", width: 5.5, height: 8.5, hardcover: true },
  { label: "6 × 9 in", width: 6, height: 9, hardcover: true },
  { label: "6.14 × 9.21 in", width: 6.14, height: 9.21, hardcover: true },
  { label: "6.69 × 9.61 in", width: 6.69, height: 9.61 },
  { label: "7 × 10 in", width: 7, height: 10, hardcover: true },
  { label: "7.44 × 9.69 in", width: 7.44, height: 9.69 },
  { label: "7.5 × 9.25 in", width: 7.5, height: 9.25 },
  { label: "8 × 10 in", width: 8, height: 10 },
  { label: "8.25 × 6 in", width: 8.25, height: 6 },
  { label: "8.25 × 8.25 in", width: 8.25, height: 8.25 },
  { label: "8.5 × 8.5 in", width: 8.5, height: 8.5 },
  { label: "8.5 × 11 in", width: 8.5, height: 11, hardcover: true },
];

// "Interior type" (loại mực in) và "Paper type" (loại giấy) là hai lựa chọn
// tách biệt trên KDP — màu (tiêu chuẩn/cao cấp) chỉ in trên giấy trắng, chỉ
// bản đen trắng mới có thêm lựa chọn giấy kem.
export type InteriorType = "bw" | "standardColor" | "premiumColor";

export const INTERIOR_TYPES: { key: InteriorType; label: string }[] = [
  { key: "bw", label: "Đen trắng" },
  { key: "standardColor", label: "Màu tiêu chuẩn" },
  { key: "premiumColor", label: "Màu cao cấp" },
];

export type PaperType = "white" | "cream";

export const PAPER_TYPES: { key: PaperType; label: string }[] = [
  { key: "white", label: "Trắng" },
  { key: "cream", label: "Kem (cream)" },
];

export function paperTypesFor(interiorType: InteriorType): PaperType[] {
  return interiorType === "bw" ? ["white", "cream"] : ["white"];
}

export function paperThickness(interiorType: InteriorType, paperType: PaperType) {
  if (interiorType === "premiumColor") return 1 / 426;
  if (paperType === "cream") return 1 / 400;
  return 1 / 444; // trắng: đen trắng hoặc màu tiêu chuẩn
}

export function spineWidthIn(pageCount: number, interiorType: InteriorType, paperType: PaperType) {
  return Math.max(0, pageCount) * paperThickness(interiorType, paperType);
}

export const BLEED_IN = 0.125;
export const DPI = 300;
export const INCH_TO_CM = 2.54;

// Bìa gộp: lề an toàn 0.125in trên/dưới + cạnh ngoài (không trừ ở cạnh giáp
// gáy), gáy có lề an toàn riêng 0.0625in mỗi bên, mã vạch ISBN (Amazon tự
// chèn) cần chừa tối thiểu 0.25in cách mép trong góc bìa sau.
export const MARGIN_IN = 0.125;
export const SPINE_MARGIN_IN = 0.0625;
export const BARCODE_MARGIN_IN = 0.25;
export const BARCODE_WIDTH_IN = 2;
export const BARCODE_HEIGHT_IN = 1.2;

export function inchToCm(inch: number) {
  return inch * INCH_TO_CM;
}

export function inchToPx(inch: number, dpi = DPI) {
  return Math.round(inch * dpi);
}

// Lề gáy (trong) của TRANG RUỘT tăng dần theo số trang — càng dày sách càng
// cần chừa nhiều để không mất chữ/hình vào nếp gấp khi đóng sách. Đây là quy
// tắc riêng cho trang ruột, khác với lề của bìa gộp ở trên.
export function gutterMarginIn(pageCount: number) {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

export const OUTER_MARGIN_IN = 0.25;

export function interiorSizes(trim: { width: number; height: number }, bleed: boolean) {
  const trimW = trim.width;
  const trimH = trim.height;
  const fileW = bleed ? trimW + BLEED_IN : trimW;
  const fileH = bleed ? trimH + BLEED_IN * 2 : trimH;
  return { trimW, trimH, fileW, fileH };
}

export type Dim = { w: number; h: number };

export type CoverBreakdown = {
  fullCover: Dim;
  frontCover: Dim;
  safeArea: Dim;
  bleed: Dim;
  margin: Dim;
  spine: Dim;
  spineSafeArea: Dim;
  spineMargin: Dim;
  barcodeMargin: Dim;
  // Tổng khổ xén (không tràn lề) — bìa trước + gáy + bìa sau.
  trimTotalW: number;
  trimTotalH: number;
  fileW: number;
  fileH: number;
};

export function coverSizes(
  trim: { width: number; height: number },
  pageCount: number,
  interiorType: InteriorType,
  paperType: PaperType,
): CoverBreakdown {
  const spineW = spineWidthIn(pageCount, interiorType, paperType);
  const trimTotalW = trim.width * 2 + spineW;
  const trimTotalH = trim.height;
  const fileW = trimTotalW + BLEED_IN * 2;
  const fileH = trimTotalH + BLEED_IN * 2;

  return {
    fullCover: { w: fileW, h: fileH },
    frontCover: { w: trim.width, h: trim.height },
    safeArea: { w: trim.width - MARGIN_IN, h: trim.height - MARGIN_IN * 2 },
    bleed: { w: BLEED_IN, h: BLEED_IN },
    margin: { w: MARGIN_IN, h: MARGIN_IN },
    spine: { w: spineW, h: trim.height },
    spineSafeArea: { w: Math.max(0, spineW - SPINE_MARGIN_IN * 2), h: trim.height - MARGIN_IN * 2 },
    spineMargin: { w: SPINE_MARGIN_IN, h: SPINE_MARGIN_IN },
    barcodeMargin: { w: BARCODE_MARGIN_IN, h: BARCODE_MARGIN_IN },
    trimTotalW,
    trimTotalH,
    fileW,
    fileH,
  };
}

export function formatIn(n: number) {
  return `${n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} in`;
}

export function formatCm(inch: number) {
  return `${inchToCm(inch).toFixed(2)} cm`;
}

export function formatPx(inch: number) {
  return `${inchToPx(inch).toLocaleString("vi-VN")} px`;
}
