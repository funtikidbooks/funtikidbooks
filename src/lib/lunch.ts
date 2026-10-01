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

// A free illustration per category, for a dish (or a quán with no dishes
// yet) without a photo of its own. Unsplash, free to use.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=800&q=70&auto=format&fit=crop`;
export const CATEGORY_PHOTO: Record<LunchThemeId, string> = {
  com: U("1762305193367-91e072e47c3f"),
  nuoc: U("1766050586763-723571af4dde"),
  banhmi: U("1710532774170-9844f837ae54"),
  ga: U("1426869981800-95ebf51ce900"),
  chay: U("1511690656952-34342bb7c2f2"),
  healthy: U("1512621776951-a57141f2eefd"),
  hannhat: U("1741295017668-c8132acd6fc0"),
  anvat: U("1695712641569-05eee7b37b6d"),
  uong: U("1745883949374-baeba0ed57c3"),
};

// Smaller copy of an Unsplash photo for a card; other photos as they are.
export function sizedPhoto(url: string, width: number) {
  return url.includes("images.unsplash.com") ? url.replace(/([?&])w=\d+/, `$1w=${width}`) : url;
}

// Under this a menu line is a side (thêm trứng, thêm cơm) — not its own card.
export const SIDE_PRICE = 15000;

export type LunchDish = {
  key: string;
  shop: FoodShop;
  item: FoodShopMenuItem | null; // null = the quán itself, no menu yet
  name: string;
  category: LunchThemeId | null;
  price: number | null;
  vegetarian: boolean;
  photo: string | null;
  sample: boolean; // illustration, not the real dish
  open: boolean | null;
};

const THEME_IDS = new Set<string>(LUNCH_THEMES.map((t) => t.id));

// The dish wall: every dish of every quán that passes the quán-level
// requirements, then the topic/budget filters on the dish itself. A quán
// without a menu yet shows as one card (its name, its range, its topic).
export function filterDishes(
  shops: FoodShop[],
  menus: Map<string, FoodShopMenuItem[]>,
  f: LunchFilters,
  now: Date,
  lastOrdered: Map<string, string>,
): LunchDish[] {
  const budget = f.budget ? LUNCH_BUDGETS.find((b) => b.id === f.budget) ?? null : null;
  const out: LunchDish[] = [];
  // Quán-level requirements first (reuse filterLunch without topic/budget);
  // "có món chay" is judged per dish below, not per quán.
  const shopNeeds = f.needs.filter((n) => n !== "veg");
  const shopsOk = filterLunch(shops, menus, { themes: [], budget: null, needs: shopNeeds }, now, lastOrdered);
  for (const { shop, open, price: range } of shopsOk) {
    const items = (menus.get(shop.id) ?? []).filter((i) => !(typeof i.price === "number" && i.price > 0 && i.price < SIDE_PRICE));
    const shopTheme = (shop.themes ?? []).find((t) => THEME_IDS.has(t)) as LunchThemeId | undefined;
    const cards: LunchDish[] =
      items.length > 0
        ? items.map((i) => {
            const category = (i.category && THEME_IDS.has(i.category) ? i.category : shopTheme ?? null) as LunchThemeId | null;
            const vegetarian = !!i.vegetarian || category === "chay";
            return {
              key: i.id,
              shop,
              item: i,
              name: i.name,
              category,
              price: typeof i.price === "number" && i.price > 0 ? i.price : null,
              vegetarian,
              photo: i.photo_url ?? (category ? CATEGORY_PHOTO[category] : null),
              sample: i.photo_url ? !!i.photo_is_sample : true,
              open,
            };
          })
        : [
            {
              key: `shop-${shop.id}`,
              shop,
              item: null,
              name: shop.name,
              category: shopTheme ?? null,
              price: null,
              vegetarian: !!shop.vegetarian || shopTheme === "chay",
              photo: shopTheme ? CATEGORY_PHOTO[shopTheme] : null,
              sample: true,
              open,
            },
          ];
    for (const d of cards) {
      const cats = d.item ? [d.category] : shop.themes ?? [];
      if (f.themes.length > 0 && !f.themes.some((t) => cats.includes(t))) continue;
      if (f.needs.includes("veg") && !d.vegetarian && !(d.item === null && shop.vegetarian)) continue;
      if (budget) {
        const p = d.price;
        if (p !== null) {
          if (p < budget.min || p >= budget.max) continue;
        } else if (!range || range.min >= budget.max || range.max < budget.min) continue;
      }
      out.push(d);
    }
  }
  return out;
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
