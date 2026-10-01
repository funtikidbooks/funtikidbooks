// Reads for the Đặt đồ ăn room, straight from the browser to Supabase (RLS
// as the signed-in user, exactly like the server actions they replace).
// Server actions run one at a time per page, so a room that needed shops,
// rounds, each round's orders and each quán's menu used to wait for them in
// a queue; these run side by side. The last result is kept in memory too,
// so reopening the room or "Trưa nay ăn gì?" shows it at once while a fresh
// copy loads behind it. Writes stay server actions.

import { createClient } from "@/lib/supabase/client";
import { vnToday } from "@/lib/constants/attendance";
import type { FoodOrderItem, FoodOrderRound, FoodShop, FoodShopMenuItem } from "@/lib/types";

const db = () => createClient();

export type LunchData = { shops: FoodShop[]; items: FoodShopMenuItem[]; lastOrdered: Record<string, string> };

const cache: {
  shops?: FoodShop[];
  menus?: FoodShopMenuItem[];
  lunch?: LunchData;
  rounds: Map<string, FoodOrderRound[]>;
} = { rounds: new Map() };

// One request in flight per key — two components asking at once share it.
const inflight = new Map<string, Promise<unknown>>();
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const byName = (a: FoodShop, b: FoodShop) => a.name.localeCompare(b.name, "vi");

export const peekShops = () => cache.shops;
export const peekRounds = (channelId: string) => cache.rounds.get(channelId);
export const peekLunchData = () => cache.lunch;

export function fetchShops(): Promise<FoodShop[]> {
  return once("shops", async () => {
    const { data, error } = await db().from("food_shops").select("*").order("name", { ascending: true });
    if (error) throw new Error("Không tải được danh sách quán.");
    cache.shops = (data ?? []) as FoodShop[];
    return cache.shops;
  });
}

// Every quán's menu in one go — a few hundred short rows at most.
export function fetchMenus(): Promise<FoodShopMenuItem[]> {
  return once("menus", async () => {
    const { data, error } = await db().from("food_shop_menu_items").select("*").order("sort_order", { ascending: true });
    if (error) throw new Error("Không tải được thực đơn.");
    cache.menus = (data ?? []) as FoodShopMenuItem[];
    return cache.menus;
  });
}

// One quán's menu — from the cache, or `fresh` straight from the database
// (a quán someone just created or whose menu just changed).
export async function fetchMenu(shopId: string, fresh = false): Promise<FoodShopMenuItem[]> {
  if (!fresh) {
    const all = cache.menus ?? (await fetchMenus());
    return all.filter((m) => m.shop_id === shopId);
  }
  const { data, error } = await db().from("food_shop_menu_items").select("*").eq("shop_id", shopId).order("sort_order", { ascending: true });
  if (error) throw new Error("Không tải được thực đơn.");
  const items = (data ?? []) as FoodShopMenuItem[];
  setCachedMenu(shopId, items);
  return items;
}

// One dish changed (a real photo, its topic) — keep the cache in step.
export function patchCachedItem(id: string, patch: Partial<FoodShopMenuItem>) {
  const put = (list: FoodShopMenuItem[]) => list.map((m) => (m.id === id ? { ...m, ...patch } : m));
  if (cache.menus) cache.menus = put(cache.menus);
  if (cache.lunch) cache.lunch = { ...cache.lunch, items: put(cache.lunch.items) };
}

// A quán's menu was rewritten (EditShopMenuForm) — keep the cache in step.
export function setCachedMenu(shopId: string, items: FoodShopMenuItem[]) {
  if (cache.menus) cache.menus = [...cache.menus.filter((m) => m.shop_id !== shopId), ...items];
  if (cache.lunch) cache.lunch = { ...cache.lunch, items: [...cache.lunch.items.filter((m) => m.shop_id !== shopId), ...items] };
}

export function setCachedShop(shop: FoodShop) {
  const put = (list: FoodShop[]) => (list.some((s) => s.id === shop.id) ? list.map((s) => (s.id === shop.id ? shop : s)) : [...list, shop]).sort(byName);
  if (cache.shops) cache.shops = put(cache.shops);
  if (cache.lunch) cache.lunch = { ...cache.lunch, shops: put(cache.lunch.shops) };
}

export function fetchTodayRounds(channelId: string): Promise<FoodOrderRound[]> {
  return once(`rounds-${channelId}`, async () => {
    const { data, error } = await db()
      .from("food_order_rounds")
      .select("*")
      .eq("channel_id", channelId)
      .eq("order_date", vnToday())
      .order("created_at", { ascending: true });
    if (error) throw new Error("Không tải được đợt đặt đồ ăn.");
    const rounds = (data ?? []) as FoodOrderRound[];
    cache.rounds.set(channelId, rounds);
    return rounds;
  });
}

export function setCachedRounds(channelId: string, rounds: FoodOrderRound[]) {
  cache.rounds.set(channelId, rounds);
}

// A round's orders and quán, side by side.
export async function fetchRoundDetail(roundId: string): Promise<{ items: FoodOrderItem[]; shopIds: string[] }> {
  const [items, links] = await Promise.all([
    db().from("food_order_items").select("*").eq("round_id", roundId).order("created_at", { ascending: true }),
    db().from("food_order_round_shops").select("shop_id").eq("round_id", roundId),
  ]);
  if (items.error || links.error) throw new Error("Không thể tải đợt này.");
  return {
    items: (items.data ?? []) as FoodOrderItem[],
    shopIds: (links.data ?? []).map((r) => r.shop_id as string),
  };
}

// "Trưa nay ăn gì?": every quán and menu, plus when each quán was last
// ordered from (the last 30 days) for "Đổi gió".
export function fetchLunchData(): Promise<LunchData> {
  return once("lunch", async () => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const [shops, items, rounds] = await Promise.all([
      fetchShops(),
      fetchMenus(),
      db().from("food_order_rounds").select("id, order_date").gte("order_date", since),
    ]);
    const dateByRound = new Map((rounds.data ?? []).map((r) => [r.id as string, r.order_date as string]));
    const lastOrdered: Record<string, string> = {};
    if (dateByRound.size > 0) {
      const { data: links } = await db().from("food_order_round_shops").select("round_id, shop_id").in("round_id", [...dateByRound.keys()]);
      for (const l of links ?? []) {
        const d = dateByRound.get(l.round_id as string);
        const id = l.shop_id as string;
        if (d && (!lastOrdered[id] || d > lastOrdered[id])) lastOrdered[id] = d;
      }
    }
    cache.lunch = { shops, items, lastOrdered };
    return cache.lunch;
  });
}
