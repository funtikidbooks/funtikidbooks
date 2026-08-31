"use server";

import { createClient } from "@/lib/supabase/server";
import type { FoodShop, FoodShopMenuItem } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

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

// Adds a quán once, with its menu already on file — reads off a real
// ShopeeFood menu by hand, or typed in directly. Later rounds just pick
// this shop instead of anyone free-typing what they want.
export async function addFoodShop(input: {
  name: string;
  shopeeLink: string;
  items: { name: string; note: string; price: number | null }[];
}): Promise<FoodShop> {
  const { supabase, user } = await requireUser();
  const name = input.name.trim();
  if (!name) throw new Error("Cần nhập tên quán.");
  const items = input.items.map((it) => ({ ...it, name: it.name.trim() })).filter((it) => it.name);
  if (items.length === 0) throw new Error("Cần thêm ít nhất 1 món trong menu.");

  const { data: shop, error } = await supabase
    .from("food_shops")
    .insert({ name, shopee_link: input.shopeeLink.trim() || null, added_by: user.id })
    .select("*")
    .single();
  if (error || !shop) throw new Error("Không thể thêm quán.");

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

  return shop as FoodShop;
}

export async function deleteFoodShop(shopId: string): Promise<void> {
  const { supabase } = await requireUser();
  await supabase.from("food_shops").delete().eq("id", shopId);
}
