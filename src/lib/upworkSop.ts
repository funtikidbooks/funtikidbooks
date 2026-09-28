// The Upwork client-evaluation SOP (SOP-01), stored as one structured JSON
// document so its page can keep the slide deck's own layout per section
// while every piece of text stays editable — and so the overnight search
// can read the criteria and pass score as data rather than prose.

export type SopStep = { title: string; description: string };

// One line of the studio's price list, in USD per unit. Each column is the
// lowest budget that still counts as that tier; kept as text so a half-filled
// table saves as-is and "$1,200" reads the same as "1200".
export type PriceRow = { name: string; unit: string; good: string; average: string; low: string; note: string };
export type PriceBand = "good" | "average" | "low" | "below";

export type UpworkSop = {
  cover: { eyebrow: string; title: string; department: string; docCode: string; scope: string };
  overviewIntro: string;
  classify: {
    title: string;
    summary: string;
    intro: string;
    items: { name: string; tagline: string; description: string; action: string }[];
  };
  criteria: {
    title: string;
    summary: string;
    intro: string;
    passScore: number;
    rows: { name: string; howToCheck: string }[];
    note: string;
  };
  realName: {
    title: string;
    summary: string;
    intro: string;
    steps: SopStep[];
    calloutTitle: string;
    callout: string;
    safeGreeting: string;
  };
  timing: {
    title: string;
    summary: string;
    intro: string;
    regions: { code: string; name: string; role: string; hours: string }[];
    steps: SopStep[];
  };
  coverLetter: { title: string; summary: string; intro: string; parts: SopStep[]; tipsTitle: string; tips: string[] };
  pricing: {
    title: string;
    summary: string;
    intro: string;
    rows: PriceRow[];
    goodAction: string;
    averageAction: string;
    lowAction: string;
    belowAction: string;
    note: string;
  };
  decision: {
    title: string;
    summary: string;
    intro: string;
    conditions: string[];
    tiersIntro: string;
    tiers: { range: string; title: string; description: string }[];
  };
  closing: { title: string; text: string };
};

// Transcribed from "SOP - Quy Trinh Danh Gia Khach Hang Upwork (Ban Chuan)"
// — shown until the first edit is saved.
export const DEFAULT_UPWORK_SOP: UpworkSop = {
  cover: {
    eyebrow: "Quy trình chuẩn nội bộ",
    title: "Tìm Kiếm và Đánh Giá Khách Hàng Mới Trên Upwork",
    department: "Funti Kid Books | Bộ phận Tìm kiếm và Phát triển Khách hàng",
    docCode: "Tài liệu SOP-01",
    scope: "Áp dụng cho toàn bộ nhân sự phụ trách đấu thầu",
  },
  overviewIntro: "Tài liệu gồm sáu phần, áp dụng theo thứ tự khi tìm kiếm khách hàng Outbound.",
  classify: {
    title: "Phân Loại Khách Hàng",
    summary: "Phân biệt Inbound và Outbound để áp dụng đúng quy trình.",
    intro: "Xác định đúng dạng khách hàng trước khi quyết định có áp dụng quy trình đánh giá hay không.",
    items: [
      {
        name: "Inbound",
        tagline: "Khách hàng chủ động liên hệ",
        description: "Không cần áp dụng quy trình đánh giá. Chỉ cần trả lời tin nhắn của khách một cách nhanh chóng và chuyên nghiệp.",
        action: "Ưu tiên phản hồi nhanh, không tốn connects.",
      },
      {
        name: "Outbound",
        tagline: "Khách hàng cần chủ động tìm kiếm",
        description: "Mỗi lượt đấu thầu đều tốn connects là chi phí thật. Bắt buộc đánh giá kỹ theo checklist trước khi quyết định bid.",
        action: "Áp dụng đầy đủ quy trình đánh giá bên dưới.",
      },
    ],
  },
  criteria: {
    title: "Bảng Tiêu Chí Đánh Giá",
    summary: "Chấm điểm khách hàng theo bốn tiêu chí, thang 20 điểm.",
    intro: "Chấm điểm 1 đến 5 cho mỗi tiêu chí. Tổng tối đa 20 điểm. Chỉ tiến hành bid khi đạt từ 15 điểm trở lên.",
    passScore: 15,
    rows: [
      {
        name: "Lịch sử và thanh toán uy tín",
        howToCheck: "Kiểm tra Member since, số job đã đăng, Payment method verified và tổng chi tiêu.",
      },
      { name: "Đánh giá từ freelancer khác", howToCheck: "Đọc review trong các job đã đóng, yêu cầu phản hồi tích cực." },
      {
        name: "Lĩnh vực hoạt động",
        howToCheck: "Ưu tiên nhà văn, biên tập viên, ghostwriter, sách thiếu nhi, truyện tranh.",
      },
      {
        name: "Tỷ lệ thuê lại (Hire rate)",
        howToCheck: "Tỷ lệ càng cao càng cho thấy khách hàng nghiêm túc trong tuyển dụng.",
      },
    ],
    note: "Khách hàng ở mọi quốc gia đều được chấp nhận, không giới hạn khu vực địa lý.",
  },
  realName: {
    title: "Tìm Tên Thật Của Khách Hàng",
    summary: "Xác minh danh tính qua đánh giá của freelancer khác.",
    intro: "Profile Upwork không hiển thị tên thật. Cần xác minh qua đánh giá của freelancer khác để chào hỏi đúng cách.",
    steps: [
      { title: "Đọc review và feedback", description: "Mở các bài đánh giá do freelancer từng làm việc để lại trên profile khách hàng." },
      {
        title: "Tìm tên được nhắc đến",
        description: "Xem có freelancer nào nhắc tên riêng của khách trong lời cảm ơn hoặc feedback không.",
      },
      {
        title: "Nếu không tìm được tên",
        description: "Dùng lời chào trung tính và lịch sự. Tuyệt đối không suy đoán hoặc bịa tên khách hàng.",
      },
    ],
    calloutTitle: "Lưu ý quan trọng",
    callout: "Một lời chào sai tên gây ấn tượng thiếu chuyên nghiệp hơn nhiều so với lời chào trung tính.",
    safeGreeting: "Hi there, I came across your job posting and...",
  },
  timing: {
    title: "Khung Giờ Tìm Kiếm và Liên Hệ",
    summary: "Ưu tiên gửi proposal trùng giờ làm việc của khách.",
    intro:
      "Đội ngũ làm việc tại Việt Nam trong khi phần lớn khách hàng ở nước ngoài. Ưu tiên gửi proposal trùng giờ làm việc của khách.",
    regions: [
      { code: "VN", name: "Việt Nam", role: "Đội ngũ", hours: "" },
      { code: "US", name: "Hoa Kỳ", role: "Khách hàng", hours: "" },
      { code: "CA", name: "Canada", role: "Khách hàng", hours: "" },
      { code: "SG", name: "Singapore", role: "Khách hàng", hours: "" },
      { code: "EU", name: "Châu Âu", role: "Khách hàng", hours: "" },
    ],
    steps: [
      { title: "Bước 1", description: "Xác nhận khung giờ đăng job và hoạt động của khách hàng trên profile." },
      { title: "Bước 2", description: "Gửi tin nhắn và proposal trong khung giờ phù hợp đã quy định của công ty." },
    ],
  },
  coverLetter: {
    title: "Cấu Trúc Tin Chào và Cover Letter",
    summary: "Cấu trúc cover letter ngắn gọn, cá nhân hoá.",
    intro: "Bốn thành phần bắt buộc trong mọi tin chào gửi khách hàng Outbound.",
    parts: [
      { title: "Chào đúng tên", description: "Dùng tên khách hàng nếu tìm được, hoặc lời chào trung tính." },
      { title: "Nhắc đến job cụ thể", description: "Đề cập ngắn gọn yêu cầu trong job post để cho thấy đã đọc kỹ." },
      { title: "Giới thiệu kinh nghiệm", description: "Portfolio liên quan: minh hoạ sách, quy mô đội ngũ hoạ sĩ." },
      { title: "Kêu gọi hành động", description: "Kết thúc bằng đề xuất trao đổi hoặc cuộc gọi ngắn." },
    ],
    tipsTitle: "Mẹo thực hành",
    tips: [
      "Cover letter tốt thường dưới 150 từ và đi thẳng vào giá trị mang lại cho khách hàng.",
      "Luôn đọc lại toàn bộ nội dung và kiểm tra khung giờ gửi trước khi bấm gửi thật.",
    ],
  },
  pricing: {
    title: "Bảng Giá Tham Khảo",
    summary: "Mức giá tốt, trung bình, thấp để cân ngân sách job trước khi gửi đơn.",
    intro:
      "Giá tính bằng USD cho mỗi đơn vị. Ngân sách job đạt mức nào thì xếp vào mức đó; dưới mức Thấp là không nhận. Lượt canh job mỗi giờ đọc bảng này để cân từng job.",
    rows: [
      { name: "Single page (trang đơn)", unit: "trang", good: "", average: "", low: "", note: "" },
      { name: "Double page (spread)", unit: "spread", good: "", average: "", low: "", note: "" },
      { name: "Cover book (bìa sách)", unit: "bìa", good: "", average: "", low: "", note: "" },
      { name: "Trọn gói (cả cuốn)", unit: "cuốn", good: "", average: "", low: "", note: "VD: 32 trang + bìa" },
      { name: "Theo giờ (hourly)", unit: "giờ", good: "", average: "", low: "", note: "" },
    ],
    goodAction: "Gửi đơn ngay, đầu tư chất lượng.",
    averageAction: "Gửi đơn nếu khách đạt điểm SOP.",
    lowAction: "Chỉ gửi khi khách uy tín hoặc job nhanh gọn.",
    belowAction: "Không gửi đơn, trừ khi Giám đốc duyệt.",
    note: "Job không ghi ngân sách hoặc số trang: hỏi lại khách trước khi báo giá.",
  },
  decision: {
    title: "Quyết Định Cuối Trước Khi Bid",
    summary: "Quy tắc xử lý theo mức connects của giá thầu.",
    intro: "Hoàn tất ba điều kiện bắt buộc, sau đó xử lý theo mức connects của giá thầu.",
    conditions: [
      "Đạt từ 15/20 điểm theo bảng tiêu chí",
      "Thời điểm liên hệ trong khung giờ phù hợp",
      "Đã soạn tin chào cá nhân hoá cho khách",
    ],
    tiersIntro: "Sau khi đủ ba điều kiện, xử lý theo mức connects:",
    tiers: [
      { range: "20–25", title: "Tiến hành bid ngay", description: "Nằm trong ngân sách connects tiêu chuẩn. Không cần chờ duyệt." },
      {
        range: "Trên 25",
        title: "Gửi Giám đốc duyệt",
        description: "Gửi link job về cho Giám đốc xem xét. Chỉ bid khi được duyệt là có tiềm năng.",
      },
    ],
  },
  closing: {
    title: "Cảm Ơn",
    text: "Áp dụng quy trình này cho mọi khách hàng Outbound trên Upwork kể từ hôm nay.\nMọi thắc mắc về quy trình, liên hệ trực tiếp Giám đốc.",
  },
};

// Each list item takes the shape of the default list's first item: plain
// strings stay strings, objects keep only that item's string fields.
function normalizeList(list: unknown[], shape: unknown): unknown[] {
  if (typeof shape === "string") return list.filter((x): x is string => typeof x === "string");
  const keys = Object.keys(shape as Record<string, unknown>);
  return list
    .filter((x) => x && typeof x === "object")
    .map((x) => Object.fromEntries(keys.map((k) => [k, typeof (x as Record<string, unknown>)[k] === "string" ? (x as Record<string, unknown>)[k] : ""])));
}

// Fills anything a saved document is missing from the defaults — keeps an
// older saved copy rendering after a field is added here, and gives the
// server a single shape to validate against.
export function normalizeSop(raw: unknown): UpworkSop {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = structuredClone(DEFAULT_UPWORK_SOP) as unknown as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    const def = out[key];
    const val = src[key];
    if (typeof def === "string") {
      if (typeof val === "string") out[key] = val;
      continue;
    }
    if (!val || typeof val !== "object") continue;
    const section = def as Record<string, unknown>;
    for (const field of Object.keys(section)) {
      const v = (val as Record<string, unknown>)[field];
      const d = section[field];
      if (Array.isArray(d)) {
        if (Array.isArray(v)) section[field] = normalizeList(v, d[0]);
      } else if (typeof d === typeof v) {
        section[field] = v;
      }
    }
  }
  return out as unknown as UpworkSop;
}

// "$1,200" → 1200; blank or not a number → null (that tier isn't set yet).
export function parsePrice(text: string): number | null {
  const digits = String(text ?? "").replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

const BANDS = ["good", "average", "low"] as const;

// What a job needs to reach each tier for the given quantities (qty[i] units
// of rows[i]) and which tier its budget lands in. A tier whose price is
// missing for any row in use is null and skipped; below every set tier is
// "below" only when the Thấp floor itself is known.
export function priceBand(
  budget: number,
  rows: PriceRow[],
  qty: number[],
): { band: PriceBand | null; need: Record<(typeof BANDS)[number], number | null> } {
  const used = rows.map((r, i) => ({ r, q: qty[i] ?? 0 })).filter((x) => x.q > 0);
  const need = { good: null, average: null, low: null } as Record<(typeof BANDS)[number], number | null>;
  if (used.length === 0) return { band: null, need };
  for (const b of BANDS) {
    let sum = 0;
    for (const { r, q } of used) {
      const p = parsePrice(r[b]);
      if (p === null) {
        sum = NaN;
        break;
      }
      sum += p * q;
    }
    need[b] = Number.isNaN(sum) ? null : Math.round(sum * 100) / 100;
  }
  if (!(budget > 0)) return { band: null, need };
  for (const b of BANDS) if (need[b] !== null && budget >= (need[b] as number)) return { band: b, need };
  return { band: need.low !== null ? "below" : null, need };
}
