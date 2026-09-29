// Báo giá — the shape of a quote, its ready-made starting points, and the
// arithmetic, shared by the editor, the client's page and tests
// (tests/calculations.test.mjs). Pure: no imports at runtime.

export type QuoteLang = "vi" | "en";
export type QuoteCurrency = "VND" | "USD";
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

export type QuoteItem = {
  id: string;
  // "section": a heading row between items ("Gói chính", "Phần 2"…).
  kind: "item" | "section";
  name: string;
  description: string;
  qty: number;
  // A quantity per tier instead of one for all — when the tiers are the
  // client's options rather than quality levels ("16 trang ruột + 6 sticker"
  // vs "20 + 4"). null/absent = qty applies to every tier.
  qtys?: number[] | null;
  unit: string;
  // One price per tier, in the quote's currency; null = not quoted yet.
  prices: (number | null)[];
  // One price whatever tier the client picks (prices[0]) — a test piece,
  // print layout, a flat fee.
  flat: boolean;
  // "Tuỳ chọn thêm": priced and shown, but not added into the tier totals
  // (a paid test, the first page as a sample, each extra book…).
  optional: boolean;
};

export type Quote = {
  id: string;
  code: string;
  title: string;
  client_name: string;
  client_contact: string;
  // Khổ sách — "21 × 21 cm", "8.5 × 8.5 in"… free text, "" = not given.
  book_size: string;
  language: QuoteLang;
  currency: QuoteCurrency;
  tier_names: string[];
  tier_notes: string[];
  intro: string;
  items: QuoteItem[];
  terms: string;
  valid_days: number;
  prepared_by: string;
  status: QuoteStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteDraft = Omit<Quote, "id" | "code" | "created_by" | "created_at" | "updated_at">;

export const MAX_TIERS = 3;

// Quick picks for Khổ sách: Vietnamese print sizes first, then the Amazon
// KDP trims the studio designs for most (same list as Công cụ → Tính khổ sách).
export const BOOK_SIZE_SUGGESTIONS: Record<QuoteLang, string[]> = {
  vi: ["21 × 21 cm", "20 × 20 cm", "25 × 25 cm", "A4 (21 × 29,7 cm)", "A5 (14,8 × 21 cm)", "8.5 × 8.5 in", "8 × 10 in", "8.5 × 11 in"],
  en: ["8.5 × 8.5 in", "8 × 10 in", "8.5 × 11 in", "8.25 × 8.25 in", "6 × 9 in", "7 × 10 in", "21 × 21 cm", "A4 (21 × 29.7 cm)"],
};

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Nháp",
  sent: "Đã gửi khách",
  accepted: "Khách đồng ý",
  declined: "Khách từ chối",
};

type Text = Record<QuoteLang, string>;

export const TIER_PRESETS: Record<1 | 2 | 3, { names: Text[]; notes: Text[] }> = {
  1: {
    names: [{ vi: "Trọn gói", en: "Package" }],
    notes: [{ vi: "", en: "" }],
  },
  2: {
    names: [
      { vi: "Cơ bản", en: "Standard" },
      { vi: "Chi tiết cao", en: "Detailed" },
    ],
    notes: [
      { vi: "Nhân vật và bối cảnh gọn, màu phẳng.", en: "Clean characters and settings, flat colour." },
      { vi: "Bối cảnh đầy đủ, đổ bóng và ánh sáng.", en: "Full backgrounds with shading and lighting." },
    ],
  },
  3: {
    names: [
      { vi: "Cơ bản", en: "Standard" },
      { vi: "Chi tiết cao", en: "Detailed" },
      { vi: "Rất chi tiết", en: "Premium" },
    ],
    notes: [
      { vi: "Nhân vật và bối cảnh gọn, màu phẳng.", en: "Clean characters and settings, flat colour." },
      { vi: "Bối cảnh đầy đủ, đổ bóng và ánh sáng.", en: "Full backgrounds with shading and lighting." },
      { vi: "Chi tiết tối đa, chất liệu như tranh vẽ tay.", en: "Maximum detail with a hand-painted finish." },
    ],
  },
};

export const DEFAULT_TERMS: Text = {
  vi: [
    "Thanh toán: đặt cọc 50% khi bắt đầu, 50% còn lại khi bàn giao file.",
    "Thời gian: bắt đầu tính từ khi hai bên chốt nội dung và nhận cọc.",
    "Chỉnh sửa: 2 lần ở bước phác thảo, 1 lần ở bước lên màu; chỉnh thêm báo giá riêng.",
    "Bàn giao: file PNG/JPG 300 DPI đúng khổ in, kèm file gốc nếu có yêu cầu.",
  ].join("\n"),
  en: [
    "Payment: 50% deposit to start, 50% on delivery of the final files.",
    "Timeline: starts once the brief is confirmed and the deposit received.",
    "Revisions: 2 rounds at sketch stage, 1 round at colour stage; more are quoted separately.",
    "Delivery: 300 DPI PNG/JPG at print size, source files on request.",
  ].join("\n"),
};

export const DEFAULT_INTRO: Text = {
  vi: "Cảm ơn anh/chị đã tin tưởng Funti Kidbooks. Dưới đây là báo giá theo yêu cầu, anh/chị chọn mức phù hợp nhất nhé.",
  en: "Thank you for considering Funti Kidbooks. Here is our quote for your project — please pick the option that suits you best.",
};

type PresetItem = { kind?: "section"; name: Text; unit?: Text; qty?: number; flat?: boolean; optional?: boolean };
export type QuotePreset = { id: string; label: string; tiers: 1 | 2 | 3; title: Text; items: PresetItem[] };

const U = {
  page: { vi: "trang", en: "page" },
  spread: { vi: "trang đôi", en: "spread" },
  cover: { vi: "bìa", en: "cover" },
  character: { vi: "nhân vật", en: "character" },
  book: { vi: "cuốn", en: "book" },
  item: { vi: "gói", en: "item" },
};

export const QUOTE_PRESETS: QuotePreset[] = [
  {
    id: "picture",
    label: "📘 Sách tranh",
    tiers: 3,
    title: { vi: "Minh hoạ sách tranh thiếu nhi", en: "Children's picture book illustration" },
    items: [
      { name: { vi: "Thiết kế nhân vật chính", en: "Main character design" }, unit: U.character, qty: 1 },
      { name: { vi: "Minh hoạ trang đôi (spread)", en: "Double-page spread illustration" }, unit: U.spread, qty: 12 },
      { name: { vi: "Bìa sách (trước + gáy + sau)", en: "Book cover (front, spine, back)" }, unit: U.cover, qty: 1 },
      { name: { vi: "Bài test (1 trang mẫu)", en: "Paid test (1 sample page)" }, unit: U.page, qty: 1, flat: true, optional: true },
      { name: { vi: "Dàn trang & chuẩn bị file in", en: "Layout & print-ready files" }, unit: U.item, qty: 1, flat: true, optional: true },
    ],
  },
  {
    id: "coloring",
    label: "🖍 Sách tô màu",
    tiers: 2,
    title: { vi: "Sách tô màu", en: "Colouring book" },
    items: [
      { name: { vi: "Trang tô màu (nét đen trắng)", en: "Colouring page (line art)" }, unit: U.page, qty: 40 },
      { name: { vi: "Bìa màu", en: "Full-colour cover" }, unit: U.cover, qty: 1 },
      { name: { vi: "Trang đầu làm mẫu duyệt phong cách", en: "First page as a style sample" }, unit: U.page, qty: 1, flat: true, optional: true },
      { name: { vi: "Trang sticker", en: "Sticker page" }, unit: U.page, qty: 1, optional: true },
    ],
  },
  {
    id: "series",
    label: "📚 Bộ sách nhiều cuốn",
    tiers: 2,
    title: { vi: "Bộ sách minh hoạ", en: "Illustrated book series" },
    items: [
      { name: { vi: "Cuốn đầu (thiết kế nhân vật + minh hoạ)", en: "First book (character design + illustrations)" }, unit: U.book, qty: 1 },
      { name: { vi: "Các cuốn tiếp theo", en: "Each following book" }, unit: U.book, qty: 10 },
      { name: { vi: "Bài test (1 trang mẫu)", en: "Paid test (1 sample page)" }, unit: U.page, qty: 1, flat: true, optional: true },
    ],
  },
  {
    id: "test",
    label: "🧪 Bài test",
    tiers: 1,
    title: { vi: "Bài test minh hoạ", en: "Illustration test" },
    items: [{ name: { vi: "Bài test minh hoạ (1 trang)", en: "Illustration test (1 page)" }, unit: U.page, qty: 1 }],
  },
  {
    id: "blank",
    label: "✏️ Tự soạn",
    tiers: 3,
    title: { vi: "", en: "" },
    items: [{ name: { vi: "", en: "" }, unit: U.page, qty: 1 }],
  },
];

let idSeq = 0;
export const newItemId = () => `i${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function blankItem(tiers: number, patch: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: newItemId(),
    kind: "item",
    name: "",
    description: "",
    qty: 1,
    unit: "",
    prices: Array.from({ length: tiers }, () => null),
    flat: false,
    optional: false,
    ...patch,
  };
}

export function draftFromPreset(presetId: string, language: QuoteLang, preparedBy: string): QuoteDraft {
  const preset = QUOTE_PRESETS.find((p) => p.id === presetId) ?? QUOTE_PRESETS[QUOTE_PRESETS.length - 1];
  const tiers = TIER_PRESETS[preset.tiers];
  return {
    title: preset.title[language],
    client_name: "",
    client_contact: "",
    book_size: "",
    language,
    currency: language === "vi" ? "VND" : "USD",
    tier_names: tiers.names.map((n) => n[language]),
    tier_notes: tiers.notes.map((n) => n[language]),
    intro: DEFAULT_INTRO[language],
    items: preset.items.map((it) =>
      blankItem(preset.tiers, {
        kind: it.kind ?? "item",
        name: it.name[language],
        unit: it.unit?.[language] ?? "",
        qty: it.qty ?? 1,
        flat: !!it.flat,
        optional: !!it.optional,
      }),
    ),
    terms: DEFAULT_TERMS[language],
    valid_days: 14,
    prepared_by: preparedBy,
    status: "draft",
  };
}

export function qtyFor(item: QuoteItem, tier: number): number {
  const q = item.qtys?.[tier];
  return typeof q === "number" && Number.isFinite(q) ? q : Number(item.qty) || 0;
}

// "16 / 20" when the quantity differs by tier, otherwise the one number.
export function qtyText(item: QuoteItem, tierCount: number): string {
  if (!item.qtys) return String(item.qty);
  const all = Array.from({ length: tierCount }, (_, t) => qtyFor(item, t));
  return all.every((q) => q === all[0]) ? String(all[0]) : all.join(" / ");
}

// Changing how many tiers a quote has keeps the prices already typed.
export function resizeTiers(q: Pick<QuoteDraft, "tier_names" | "tier_notes" | "items" | "language">, count: number) {
  const n = Math.min(MAX_TIERS, Math.max(1, Math.round(count))) as 1 | 2 | 3;
  const preset = TIER_PRESETS[n];
  const lang = q.language;
  return {
    tier_names: Array.from({ length: n }, (_, i) => q.tier_names[i] ?? preset.names[i][lang]),
    tier_notes: Array.from({ length: n }, (_, i) => q.tier_notes[i] ?? preset.notes[i][lang]),
    items: q.items.map((it) => ({
      ...it,
      prices: Array.from({ length: n }, (_, i) => it.prices[i] ?? null),
      qtys: it.qtys ? Array.from({ length: n }, (_, i) => it.qtys?.[i] ?? it.qty) : it.qtys,
    })),
  };
}

export function unitPrice(item: QuoteItem, tier: number): number | null {
  const p = item.flat ? item.prices[0] : item.prices[tier];
  return typeof p === "number" && Number.isFinite(p) ? p : null;
}

export function lineTotal(item: QuoteItem, tier: number): number | null {
  const p = unitPrice(item, tier);
  return p === null ? null : Math.round(p * qtyFor(item, tier) * 100) / 100;
}

// The total a client pays for each tier: every priced, non-optional line.
// `missing` flags a tier where some line still has no price.
export function tierTotals(items: QuoteItem[], tierCount: number): { total: number; missing: boolean }[] {
  return Array.from({ length: tierCount }, (_, t) => {
    let total = 0;
    let missing = false;
    for (const it of items) {
      if (it.kind !== "item" || it.optional) continue;
      const line = lineTotal(it, t);
      if (line === null) missing = true;
      else total += line;
    }
    return { total: Math.round(total * 100) / 100, missing };
  });
}

// "150000", "150.000", "1,500", "$1,500.50" → a number; blank → null.
export function parseMoney(text: string, currency: QuoteCurrency): number | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const negative = raw.startsWith("-");
  let digits = raw.replace(/[^\d.,]/g, "");
  if (!digits) return null;
  if (currency === "VND") digits = digits.replace(/[.,]/g, "");
  else digits = digits.replace(/,/g, "");
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function formatMoney(n: number, currency: QuoteCurrency): string {
  if (currency === "VND") return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export const LABELS = {
  vi: {
    doc: "BÁO GIÁ",
    to: "Gửi",
    project: "Dự án",
    bookSize: "Khổ sách",
    date: "Ngày",
    validUntil: "Hiệu lực đến",
    item: "Hạng mục",
    qty: "SL",
    total: "Tổng cộng",
    options: "Tuỳ chọn thêm",
    optionsNote: "Không tính vào tổng — chọn thêm nếu cần.",
    terms: "Điều khoản",
    preparedBy: "Người báo giá",
    perUnit: "/",
    missing: "chưa đủ giá",
    choose: "Chọn mức",
  },
  en: {
    doc: "QUOTATION",
    to: "For",
    project: "Project",
    bookSize: "Book size",
    date: "Date",
    validUntil: "Valid until",
    item: "Item",
    qty: "Qty",
    total: "Total",
    options: "Optional extras",
    optionsNote: "Not included in the total — add if needed.",
    terms: "Terms",
    preparedBy: "Prepared by",
    perUnit: "/",
    missing: "incomplete",
    choose: "Option",
  },
} as const;

// Plain text for pasting into Zalo / Messenger / email.
export function quoteAsText(q: Pick<Quote, keyof QuoteDraft | "code">): string {
  const L = LABELS[q.language];
  const money = (n: number) => formatMoney(n, q.currency);
  const tiers = q.tier_names.length;
  const lines: string[] = [`${L.doc} · ${q.code}`];
  if (q.client_name) lines.push(`${L.to}: ${q.client_name}`);
  if (q.title) lines.push(`${L.project}: ${q.title}`);
  if (q.book_size?.trim()) lines.push(`${L.bookSize}: ${q.book_size.trim()}`);
  lines.push("");
  const priceText = (it: QuoteItem) => {
    if ((it.flat && !it.qtys) || tiers === 1) {
      const p = unitPrice(it, 0);
      return p === null ? "—" : `${money(p)}${it.unit ? ` ${L.perUnit} ${it.unit}` : ""}`;
    }
    if (it.qtys) {
      return q.tier_names
        .map((name, t) => {
          const line = lineTotal(it, t);
          return `${name}: ${line === null ? "—" : money(line)}`;
        })
        .join(" · ");
    }
    return q.tier_names
      .map((name, t) => {
        const p = unitPrice(it, t);
        return `${name}: ${p === null ? "—" : money(p)}`;
      })
      .join(" · ") + (it.unit ? ` (${L.perUnit} ${it.unit})` : "");
  };
  const main = q.items.filter((it) => !it.optional);
  const extras = q.items.filter((it) => it.optional && it.kind === "item");
  for (const it of main) {
    if (it.kind === "section") {
      lines.push(`— ${it.name.toUpperCase()} —`);
      continue;
    }
    lines.push(`• ${it.name}${it.qty || it.qtys ? ` — ${qtyText(it, tiers)} ${it.unit}`.trimEnd() : ""}`);
    if (it.description) lines.push(`  ${it.description}`);
    lines.push(`  ${priceText(it)}`);
  }
  const totals = tierTotals(q.items, tiers);
  lines.push("");
  lines.push(
    `${L.total.toUpperCase()}: ` +
      (tiers === 1 ? money(totals[0].total) : q.tier_names.map((name, t) => `${name} ${money(totals[t].total)}`).join(" · ")),
  );
  if (extras.length) {
    lines.push("", `${L.options}:`);
    for (const it of extras) lines.push(`• ${it.name}: ${priceText(it)}`);
  }
  if (q.terms.trim()) lines.push("", `${L.terms}:`, ...q.terms.trim().split("\n").map((t) => `- ${t.replace(/^[-•]\s*/, "")}`));
  return lines.join("\n");
}
