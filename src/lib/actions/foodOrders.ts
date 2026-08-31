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
  input: { title: string; deadlineAt?: string | null },
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
  revalidatePath("/workspace/hop");
  return data as FoodOrderRound;
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
