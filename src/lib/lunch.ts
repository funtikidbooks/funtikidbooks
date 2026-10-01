// "Trưa nay ăn gì?" — the topics, requirements and links the lunch picker
// in the Đặt đồ ăn room filters and acts on. Plain functions (no React, no
// server), checked in tests/lunch.test.mjs.

import type { FoodShop, FoodShopMenuItem } from "./types";

export const OFFICE_ADDRESS = "Toà nhà M.O.R.E, 40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM";

// Chủ đề — what kind of food. Stored on a quán as these ids.
export const LUNCH_THEMES = [
  { id: "com", label: "Cơm", icon: "🍚" },
  { id: "nuoc", label: "Bún · Phở · Mì · Cháo", icon: "🍜" },
  { id: "banhmi", label: "Bánh mì · Xôi", icon: "🥖" },
  { id: "ga", label: "Gà · Đồ chiên", icon: "🍗" },
  { id: "chay", label: "Chay", icon: "🥬" },
  { id: "healthy", label: "Healthy · Salad", icon: "🥗" },
  { id: "hannhat", label: "Hàn · Nhật", icon: "🍱" },
  { id: "anvat", label: "Ăn vặt", icon: "🍢" },
  { id: "uong", label: "Trà sữa · Cà phê", icon: "🧋" },
] as const;
export type LunchThemeId = (typeof LUNCH_THEMES)[number]["id"];

// Ngân sách — per dish.
export const LUNCH_BUDGETS = [
  { id: "u40", label: "Dưới 40k", min: 0, max: 40000 },
  { id: "40-60", label: "40k – 60k", min: 40000, max: 60000 },
  { id: "60-100", label: "60k – 100k", min: 60000, max: 100000 },
  { id: "o100", label: "Trên 100k", min: 100000, max: Infinity },
] as const;
export type LunchBudgetId = (typeof LUNCH_BUDGETS)[number]["id"];

// Yêu cầu — each one a yes/no check on a quán.
export const LUNCH_NEEDS = [
  { id: "near", label: "Gần văn phòng (đi bộ được)" },
  { id: "open", label: "Đang mở cửa" },
  { id: "delivery", label: "Đặt giao được (có link ShopeeFood/Grab)" },
  { id: "dinein", label: "Ngồi ăn tại quán" },
  { id: "veg", label: "Có món chay" },
  { id: "phone", label: "Có số điện thoại để gọi" },
  { id: "fresh", label: "Đổi gió — chưa đặt trong 7 ngày" },
] as const;
export type LunchNeedId = (typeof LUNCH_NEEDS)[number]["id"];

export type LunchFilters = { themes: LunchThemeId[]; budget: LunchBudgetId | null; needs: LunchNeedId[] };

// "10:00 - 22:00" (also "10h-22h", "10:00–14:00, 17:00–21:00") open at `now`
// (Vietnam time)? Unknown hours → null, i.e. "we can't say".
export function isOpenAt(hours: string | null | undefined, now: Date): boolean | null {
  if (!hours) return null;
  const ranges = [...hours.matchAll(/(\d{1,2})[:h](\d{2})?\s*[-–]\s*(\d{1,2})[:h](\d{2})?/g)];
  if (ranges.length === 0) return null;
  const vn = new Date(now.getTime() + 7 * 3600 * 1000);
  const minutes = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  return ranges.some((r) => {
    const from = Number(r[1]) * 60 + Number(r[2] ?? 0);
    let to = Number(r[3]) * 60 + Number(r[4] ?? 0);
    if (to <= from) to += 24 * 60; // past midnight
    return (minutes >= from && minutes < to) || (minutes + 24 * 60 >= from && minutes + 24 * 60 < to);
  });
}

// What a dish costs there: the menu if it has prices, else the range typed
// in for the quán. null = not known yet.
export function priceRange(shop: FoodShop, items: FoodShopMenuItem[] = []): { min: number; max: number } | null {
  const prices = items.map((i) => i.price).filter((p): p is number => typeof p === "number" && p > 0);
  if (prices.length > 0) return { min: Math.min(...prices), max: Math.max(...prices) };
  if (shop.price_min || shop.price_max) {
    const min = shop.price_min ?? shop.price_max!;
    const max = shop.price_max ?? shop.price_min!;
    return { min, max };
  }
  return null;
}

export function formatK(n: number) {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}đ`;
}

// Where it is: the saved map link, else a Google Maps search for name + address.
export function mapLink(shop: Pick<FoodShop, "name" | "address" | "map_url">) {
  if (shop.map_url) return shop.map_url;
  const q = [shop.name, shop.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// Walking directions from the studio.
export function directionsLink(shop: Pick<FoodShop, "name" | "address">) {
  const dest = shop.address ? `${shop.name}, ${shop.address}` : shop.name;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(OFFICE_ADDRESS)}&destination=${encodeURIComponent(dest)}&travelmode=walking`;
}

export function telLink(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export type LunchMatch = { shop: FoodShop; items: FoodShopMenuItem[]; price: { min: number; max: number } | null; open: boolean | null };

// Every quán that meets every ticked box. A topic matches if the quán has
// any of the ticked topics; the budget matches if some dish (or the quán's
// range) falls in it. `lastOrdered` = shop id → last order date (YYYY-MM-DD).
export function filterLunch(
  shops: FoodShop[],
  menus: Map<string, FoodShopMenuItem[]>,
  f: LunchFilters,
  now: Date,
  lastOrdered: Map<string, string>,
): LunchMatch[] {
  const budget = f.budget ? LUNCH_BUDGETS.find((b) => b.id === f.budget) ?? null : null;
  const weekAgo = new Date(now.getTime() + 7 * 3600 * 1000 - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const out: LunchMatch[] = [];
  for (const shop of shops) {
    const items = menus.get(shop.id) ?? [];
    const themes = shop.themes ?? [];
    if (f.themes.length > 0 && !f.themes.some((t) => themes.includes(t))) continue;
    const price = priceRange(shop, items);
    if (budget) {
      if (!price) continue;
      const priced = items.filter((i) => typeof i.price === "number" && i.price > 0);
      const fits = priced.length > 0 ? priced.some((i) => i.price! >= budget.min && i.price! < budget.max) : price.min < budget.max && price.max >= budget.min;
      if (!fits) continue;
    }
    const open = isOpenAt(shop.opening_hours, now);
    const needs = new Set(f.needs);
    if (needs.has("near") && !shop.near_office) continue;
    if (needs.has("open") && open !== true) continue;
    if (needs.has("delivery") && !shop.shopee_link) continue;
    if (needs.has("dinein") && !shop.dine_in) continue;
    if (needs.has("veg") && !(shop.vegetarian || themes.includes("chay"))) continue;
    if (needs.has("phone") && !shop.phone) continue;
    if (needs.has("fresh") && (lastOrdered.get(shop.id) ?? "") >= weekAgo) continue;
    out.push({ shop, items, price, open });
  }
  // Open ones first, then the ones not ordered for longest, then by name.
  return out.sort(
    (a, b) =>
      Number(b.open === true) - Number(a.open === true) ||
      (lastOrdered.get(a.shop.id) ?? "").localeCompare(lastOrdered.get(b.shop.id) ?? "") ||
      a.shop.name.localeCompare(b.shop.name, "vi"),
  );
}
