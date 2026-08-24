export const LABEL_PALETTE = [
  { key: "green", color: "#3F9E52", name: "Xanh lá" },
  { key: "yellow", color: "#D6A400", name: "Vàng" },
  { key: "orange", color: "#FF7A3D", name: "Cam" },
  { key: "red", color: "#E5484D", name: "Đỏ" },
  { key: "purple", color: "#8B5CF6", name: "Tím" },
  { key: "blue", color: "#4F80D9", name: "Xanh dương" },
  { key: "sky", color: "#3B98BE", name: "Xanh da trời" },
  { key: "pink", color: "#EC4899", name: "Hồng" },
] as const;

export function labelColor(key: string): string {
  return LABEL_PALETTE.find((l) => l.key === key)?.color ?? "var(--color-neutral-400)";
}
