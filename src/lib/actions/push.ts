"use server";

import { createClient } from "@/lib/supabase/server";

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
