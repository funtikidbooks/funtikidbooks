"use server";

import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";
import { storagePathFromPublicUrl } from "@/lib/storagePath";
import type { FoodShop, FoodShopMenuItem } from "@/lib/types";

const ALLOWED_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_PHOTO_SIZE = 20 * 1024 * 1024;

// The whole library — just enough to render a "Chọn quán" picker when
// starting a new food order round.
export async function listFoodShops(): Promise<FoodShop[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("food_shops").select("*").order("name", { ascending: true });
  return (data ?? []) as FoodShop[];
}

export async function getFoodShopMenu(shopId: string): Promise<FoodShopMenuItem[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("food_shop_menu_items")
    .select("*")
    .eq("shop_id", shopId)
    .order("sort_order", { ascending: true });
  return (data ?? []) as FoodShopMenuItem[];
}

// Adds a quán once — with its menu typed in directly, or with zero items
// and just a screenshotted photo instead (see uploadFoodShopPhoto below),
// left for someone to transcribe later via replaceFoodShopItems. Later
// rounds just pick this shop instead of anyone free-typing what they want.
export async function addFoodShop(input: {
  name: string;
  shopeeLink: string;
  items: { name: string; note: string; price: number | null }[];
}): Promise<FoodShop> {
  const { supabase, user } = await requireUser();
  const name = input.name.trim();
  if (!name) throw new Error("Cần nhập tên quán.");
  const items = input.items.map((it) => ({ ...it, name: it.name.trim() })).filter((it) => it.name);

  const { data: shop, error } = await supabase
    .from("food_shops")
    .insert({ name, shopee_link: input.shopeeLink.trim() || null, added_by: user.id })
    .select("*")
    .single();
  if (error || !shop) throw new Error("Không thể thêm quán.");

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("food_shop_menu_items").insert(
      items.map((it, i) => ({
        shop_id: shop.id,
        name: it.name,
        note: it.note.trim() || null,
        price: it.price,
        sort_order: i,
      })),
    );
    if (itemsError) throw new Error("Đã thêm quán nhưng không thể lưu menu.");
  }

  return shop as FoodShop;
}

// A screenshotted menu photo for a quán that doesn't have its items typed
// in yet — someone (director, or Claude asked to read it in a session)
// fills the real menu in afterward with replaceFoodShopItems.
export async function uploadFoodShopPhoto(shopId: string, formData: FormData): Promise<string> {
  const { supabase } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu ảnh menu.");
  if (!ALLOWED_PHOTO_TYPES.has(file.type)) throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, GIF hoặc WEBP.");
  if (file.size > MAX_PHOTO_SIZE) throw new Error("Ảnh vượt quá 20MB.");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storagePath = `food-shops/${shopId}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("task-attachments").upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw new Error("Không thể tải ảnh lên");

  const { data: publicUrlData } = supabase.storage.from("task-attachments").getPublicUrl(storagePath);
  const { error } = await supabase.from("food_shops").update({ photo_url: publicUrlData.publicUrl }).eq("id", shopId);
  if (error) throw new Error("Không thể lưu ảnh menu.");

  return publicUrlData.publicUrl;
}

// Replaces a shop's whole menu in one go — used both to fill in the real
// items for a shop that started out as just a photo, and to correct an
// existing menu later (a price changed, a món got renamed).
export async function replaceFoodShopItems(
  shopId: string,
  items: { name: string; note: string; price: number | null }[],
): Promise<FoodShopMenuItem[]> {
  const { supabase } = await requireUser();
  const cleaned = items.map((it) => ({ ...it, name: it.name.trim() })).filter((it) => it.name);

  await supabase.from("food_shop_menu_items").delete().eq("shop_id", shopId);
  if (cleaned.length === 0) return [];

  const { data, error } = await supabase
    .from("food_shop_menu_items")
    .insert(cleaned.map((it, i) => ({ shop_id: shopId, name: it.name, note: it.note.trim() || null, price: it.price, sort_order: i })))
    .select("*");
  if (error) throw new Error("Không thể lưu menu.");
  return (data ?? []) as FoodShopMenuItem[];
}

export async function deleteFoodShop(shopId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { data: shop } = await supabase.from("food_shops").select("photo_url").eq("id", shopId).maybeSingle();
  await supabase.from("food_shops").delete().eq("id", shopId);
  if (shop?.photo_url) {
    const path = storagePathFromPublicUrl(shop.photo_url, "task-attachments");
    if (path) await supabase.storage.from("task-attachments").remove([path]).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// "Trưa nay ăn gì?" (lib/lunch.ts) — the library with every menu, plus when
// each quán was last ordered from (for "Đổi gió"), and saving a quán's details.
// ---------------------------------------------------------------------------

export async function listLunchData(): Promise<{
  shops: FoodShop[];
  items: FoodShopMenuItem[];
  lastOrdered: Record<string, string>;
}> {
  const { supabase } = await requireUser();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [{ data: shops }, { data: items }, { data: rounds }] = await Promise.all([
    supabase.from("food_shops").select("*").order("name", { ascending: true }),
    supabase.from("food_shop_menu_items").select("*").order("sort_order", { ascending: true }),
    supabase.from("food_order_rounds").select("id, order_date").gte("order_date", since),
  ]);
  const dateByRound = new Map((rounds ?? []).map((r) => [r.id as string, r.order_date as string]));
  const lastOrdered: Record<string, string> = {};
  if (dateByRound.size > 0) {
    const { data: links } = await supabase.from("food_order_round_shops").select("round_id, shop_id").in("round_id", [...dateByRound.keys()]);
    for (const l of links ?? []) {
      const d = dateByRound.get(l.round_id as string);
      const id = l.shop_id as string;
      if (d && (!lastOrdered[id] || d > lastOrdered[id])) lastOrdered[id] = d;
    }
  }
  return { shops: (shops ?? []) as FoodShop[], items: (items ?? []) as FoodShopMenuItem[], lastOrdered };
}

export type FoodShopDetailsInput = {
  id?: string;
  name: string;
  address: string;
  phone: string;
  mapUrl: string;
  shopeeLink: string;
  themes: string[];
  openingHours: string;
  priceMin: number | null;
  priceMax: number | null;
  nearOffice: boolean;
  dineIn: boolean;
  vegetarian: boolean;
  note: string;
};

// Adds a quán (no id) or updates one — anyone in the studio may, so the
// library stays current (a new phone number, a quán that moved).
export async function saveFoodShopDetails(input: FoodShopDetailsInput): Promise<FoodShop> {
  const { supabase, user } = await requireUser();
  const name = input.name.trim();
  if (!name) throw new Error("Cần nhập tên quán.");
  const clean = (s: string) => s.trim() || null;
  const row = {
    name,
    address: clean(input.address),
    phone: clean(input.phone),
    map_url: clean(input.mapUrl),
    shopee_link: clean(input.shopeeLink),
    themes: [...new Set(input.themes)],
    opening_hours: clean(input.openingHours),
    price_min: input.priceMin,
    price_max: input.priceMax,
    near_office: input.nearOffice,
    dine_in: input.dineIn,
    vegetarian: input.vegetarian,
    note: clean(input.note),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = input.id
    ? await supabase.from("food_shops").update(row).eq("id", input.id).select("*").single()
    : await supabase.from("food_shops").insert({ ...row, added_by: user.id }).select("*").single();
  if (error || !data) {
    if (error && (error.code === "PGRST204" || error.code === "42703" || /column/i.test(error.message))) {
      throw new Error("Chưa chạy file SQL food_shop_details.sql trên Supabase — chưa lưu được địa chỉ/số điện thoại.");
    }
    throw new Error(input.id ? "Không lưu được thông tin quán." : "Không thêm được quán.");
  }
  return data as FoodShop;
}
