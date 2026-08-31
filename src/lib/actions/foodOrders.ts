"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { vnToday } from "@/lib/constants/attendance";
import type { FoodOrderItem, FoodOrderRound } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

// Today's round for the food room, if anyone's started one yet — the panel
// shows a "Bắt đầu đặt đồ ăn hôm nay" prompt instead when this is null.
export async function getTodayFoodOrderRound(channelId: string): Promise<FoodOrderRound | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("food_order_rounds")
    .select("*")
    .eq("channel_id", channelId)
    .eq("order_date", vnToday())
    .maybeSingle();
  return (data as FoodOrderRound) ?? null;
}

export async function startFoodOrderRound(
  channelId: string,
  input: { title: string; deadlineAt?: string | null; shopIds?: string[] },
): Promise<FoodOrderRound> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("food_order_rounds")
    .insert({
      channel_id: channelId,
      order_date: vnToday(),
      title: input.title.trim() || "Đặt đồ ăn",
      deadline_at: input.deadlineAt || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  // Someone else's round for today may have landed a moment earlier — the
  // unique (channel_id, order_date) constraint makes that a conflict, not a
  // silent duplicate; just hand back the one that actually won.
  if (error) {
    const existing = await getTodayFoodOrderRound(channelId);
    if (existing) return existing;
    throw new Error("Không thể bắt đầu đợt đặt đồ ăn.");
  }

  if (input.shopIds && input.shopIds.length > 0) {
    await supabase.from("food_order_round_shops").insert(input.shopIds.map((shopId) => ({ round_id: data.id, shop_id: shopId })));
  }

  revalidatePath("/workspace/hop");
  return data as FoodOrderRound;
}

// Quán currently active in a round — zero, one, or several. Anyone can add
// another quán to an already-open round (a colleague wanting bubble tea
// from a different shop than whoever started the round picked).
export async function listRoundShopIds(roundId: string): Promise<string[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("food_order_round_shops").select("shop_id").eq("round_id", roundId);
  return (data ?? []).map((r) => r.shop_id as string);
}

export async function addShopToRound(roundId: string, shopId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("food_order_round_shops").upsert({ round_id: roundId, shop_id: shopId });
  if (error) throw new Error("Không thể thêm quán vào đợt này.");
}

export async function removeShopFromRound(roundId: string, shopId: string): Promise<void> {
  const { supabase } = await requireUser();
  await supabase.from("food_order_round_shops").delete().eq("round_id", roundId).eq("shop_id", shopId);
}

export async function updateFoodOrderRoundLink(roundId: string, shopeeLink: string): Promise<FoodOrderRound> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("food_order_rounds")
    .update({ shopee_link: shopeeLink.trim() || null })
    .eq("id", roundId)
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể lưu link đơn hàng.");
  return data as FoodOrderRound;
}

export async function setFoodOrderRoundStatus(roundId: string, status: "open" | "closed"): Promise<FoodOrderRound> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("food_order_rounds")
    .update({ status })
    .eq("id", roundId)
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể cập nhật trạng thái.");
  return data as FoodOrderRound;
}

// Lets someone redo today's round from scratch — most useful right after
// starting one without picking a shop (there's no way to attach a menu to
// an existing round after the fact). RLS restricts the actual delete to the
// round's own creator or the director; .select() after delete is how the
// caller tells an RLS-blocked no-op (0 rows) apart from a real success,
// rather than optimistically clearing local state either way.
export async function deleteFoodOrderRound(roundId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("food_order_rounds").delete().eq("id", roundId).select("id");
  if (!data || data.length === 0) throw new Error("Chỉ người tạo đợt này hoặc Giám đốc mới xoá được.");
}

export async function listFoodOrderItems(roundId: string): Promise<FoodOrderItem[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("food_order_items")
    .select("*")
    .eq("round_id", roundId)
    .order("created_at", { ascending: true });
  return (data ?? []) as FoodOrderItem[];
}

export async function upsertMyFoodOrderItem(
  roundId: string,
  input: { itemText: string; note: string; price: number | null },
): Promise<FoodOrderItem> {
  const { supabase, user } = await requireUser();
  const trimmed = input.itemText.trim();
  if (!trimmed) throw new Error("Cần nhập món muốn đặt.");

  const { data, error } = await supabase
    .from("food_order_items")
    .upsert(
      {
        round_id: roundId,
        profile_id: user.id,
        item_text: trimmed,
        note: input.note.trim() || null,
        price: input.price,
      },
      { onConflict: "round_id,profile_id" },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể lưu đơn của bạn.");
  return data as FoodOrderItem;
}

export async function deleteMyFoodOrderItem(roundId: string): Promise<void> {
  const { supabase, user } = await requireUser();
  await supabase.from("food_order_items").delete().eq("round_id", roundId).eq("profile_id", user.id);
}
