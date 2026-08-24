import type { PricingTable } from "@/lib/types";

export const PRICING_SETTING_KEY = "dich-vu-bang-gia";

// Skeleton shown until the director fills in real numbers — prices left
// blank (shows "Liên hệ báo giá") per their instruction, delivery windows
// matching what they described for each tier.
export const DEFAULT_PRICING_TABLE: PricingTable = {
  tiers: [
    { id: "starter", name: "Starter", nameEn: "Starter", priceVnd: null, priceUsd: null, delivery: "1-3 ngày", deliveryEn: "1-3 days", description: "Phác thảo nhanh", descriptionEn: "Quick sketch" },
    { id: "standard", name: "Standard", nameEn: "Standard", priceVnd: null, priceUsd: null, delivery: "24-30 ngày", deliveryEn: "24-30 days", description: "Minh hoạ đầy đủ", descriptionEn: "Full illustration" },
    { id: "advanced", name: "Advanced", nameEn: "Advanced", priceVnd: null, priceUsd: null, delivery: "Trên 30 ngày", deliveryEn: "30+ days", description: "Trọn gói cao cấp", descriptionEn: "Premium full package" },
  ],
  rows: [
    { id: "figures", label: "Số lượng minh hoạ", labelEn: "Number of illustrations", values: ["1", "2", "5"] },
    { id: "revisions", label: "Số lần chỉnh sửa", labelEn: "Revision rounds", values: ["1", "2", "2"] },
    { id: "source", label: "File gốc (PSD/AI)", labelEn: "Source files (PSD/AI)", values: ["-", "-", "✓"] },
    { id: "resolution", label: "Độ phân giải cao", labelEn: "High resolution", values: ["✓", "✓", "✓"] },
    { id: "background", label: "Bối cảnh/Background", labelEn: "Background", values: ["-", "✓", "✓"] },
    { id: "color", label: "Tô màu", labelEn: "Coloring", values: ["-", "✓", "✓"] },
    { id: "fullbody", label: "Toàn thân nhân vật", labelEn: "Full-body character", values: ["-", "✓", "✓"] },
    { id: "commercial", label: "Sử dụng thương mại", labelEn: "Commercial use", values: ["-", "✓", "✓"] },
  ],
};
