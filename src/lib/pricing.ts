import type { PricingTable } from "@/lib/types";

export const PRICING_SETTING_KEY = "dich-vu-bang-gia";

// Skeleton shown until the director fills in real numbers — prices left
// blank (shows "Liên hệ báo giá") per their instruction, delivery windows
// matching what they described for each tier.
export const DEFAULT_PRICING_TABLE: PricingTable = {
  tiers: [
    { id: "starter", name: "Starter", priceVnd: null, priceUsd: null, delivery: "1-3 ngày", description: "Phác thảo nhanh" },
    { id: "standard", name: "Standard", priceVnd: null, priceUsd: null, delivery: "24-30 ngày", description: "Minh hoạ đầy đủ" },
    { id: "advanced", name: "Advanced", priceVnd: null, priceUsd: null, delivery: "Trên 30 ngày", description: "Trọn gói cao cấp" },
  ],
  rows: [
    { id: "figures", label: "Số lượng minh hoạ", values: ["1", "2", "5"] },
    { id: "revisions", label: "Số lần chỉnh sửa", values: ["1", "2", "2"] },
    { id: "source", label: "File gốc (PSD/AI)", values: ["-", "-", "✓"] },
    { id: "resolution", label: "Độ phân giải cao", values: ["✓", "✓", "✓"] },
    { id: "background", label: "Bối cảnh/Background", values: ["-", "✓", "✓"] },
    { id: "color", label: "Tô màu", values: ["-", "✓", "✓"] },
    { id: "fullbody", label: "Toàn thân nhân vật", values: ["-", "✓", "✓"] },
    { id: "commercial", label: "Sử dụng thương mại", values: ["-", "✓", "✓"] },
  ],
};
