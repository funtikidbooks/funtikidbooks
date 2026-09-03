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
