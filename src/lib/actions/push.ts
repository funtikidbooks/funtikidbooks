"use server";

import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");
  return { supabase, user };
}

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      { onConflict: "endpoint" },
    );
}

export async function deletePushSubscription(endpoint: string) {
  const { supabase } = await requireUser();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

// Lets someone confirm from their profile that notifications actually
// reach this device, instead of guessing whether the setup worked.
export async function sendTestPush() {
  const { supabase, user } = await requireUser();
  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!count) throw new Error("Chưa có thiết bị nào đăng ký nhận thông báo.");

  await sendPushToUser(user.id, {
    title: "Funti Kidbooks Studio",
    body: "Thông báo thử — nếu bạn thấy cái này, mọi thứ đã hoạt động!",
    senderId: user.id,
    url: "/workspace",
    tag: "funti-test",
  });
}
