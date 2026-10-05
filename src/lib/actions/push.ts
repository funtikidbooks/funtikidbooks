"use server";

import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser, type PushDeviceResult } from "@/lib/push";
import type { PushSubscriptionRow } from "@/lib/types";

type SubInput = { endpoint: string; keys: { p256dh: string; auth: string } };

function missingColumn(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "PGRST204" || error.code === "42703" || /column/i.test(error.message ?? ""));
}

// Saves (or re-confirms) this device's subscription — called on every app
// open, so last_seen_at says when each device was last really in use.
// Before push_health.sql runs the extra columns don't exist: save the
// subscription itself anyway rather than lose it.
export async function savePushSubscription(sub: SubInput, device?: string) {
  const { supabase, user } = await requireUser();
  const base = { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ ...base, device: device?.slice(0, 60) ?? null, last_seen_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (missingColumn(error)) {
    await supabase.from("push_subscriptions").upsert(base, { onConflict: "endpoint" });
  }
}

// The browser swapped this device's subscription for a new one (sw.js,
// pushsubscriptionchange): drop the old endpoint, keep the new one.
export async function replacePushSubscription(oldEndpoint: string | null, sub: SubInput, device?: string) {
  const { supabase } = await requireUser();
  if (oldEndpoint && oldEndpoint !== sub.endpoint) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", oldEndpoint);
  }
  await savePushSubscription(sub, device);
}

// The device this person just opened the workspace on, and whether it can
// get notifications (push_device_state.sql) — so Quản trị sees a device that
// never signed up, not only the ones that did. Before that SQL runs the
// table is missing and this does nothing.
const PUSH_STATES = new Set(["granted", "needs-ios-install", "denied", "default", "failed", "unsupported"]);
export async function reportPushState(device: string, status: string, userAgent: string) {
  const { user } = await requireUser();
  if (!PUSH_STATES.has(status)) return;
  await createAdminClient()
    .from("push_device_state")
    .upsert(
      { profile_id: user.id, device: device.slice(0, 60), status, user_agent: userAgent.slice(0, 300), updated_at: new Date().toISOString() },
      { onConflict: "profile_id,device" },
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

// ---------------------------------------------------------------------------
// Quản trị → Thông báo trên máy (director + Project Manager, like Nhân sự)
// ---------------------------------------------------------------------------

async function requireHrManager() {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (me?.access_role !== "director" && me?.role !== "Project Manager") throw new Error("Bạn không có quyền này.");
  return { user };
}

export type PushHealthPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string | null;
  devices: Pick<
    PushSubscriptionRow,
    "id" | "device" | "created_at" | "last_seen_at" | "last_ok_at" | "last_error_at" | "last_error" | "last_delivered_at" | "last_delivery_ms"
  >[];
  // Every device they've opened the workspace on lately, signed up or not.
  states: { device: string; status: string; updatedAt: string }[];
};

export async function listPushHealth(): Promise<PushHealthPerson[]> {
  await requireHrManager();
  const admin = createAdminClient();
  const [{ data: people }, { data: subs }, { data: stateRows }] = await Promise.all([
    admin.from("profiles").select("id, display_name, avatar_url, role").order("display_name"),
    admin.from("push_subscriptions").select("*"),
    // Missing before push_device_state.sql runs → no rows, nothing breaks.
    admin
      .from("push_device_state")
      .select("profile_id, device, status, updated_at")
      .gte("updated_at", new Date(Date.now() - 14 * 86400e3).toISOString())
      .order("updated_at", { ascending: false }),
  ]);
  const statesByUser = new Map<string, PushHealthPerson["states"]>();
  for (const r of (stateRows ?? []) as { profile_id: string; device: string; status: string; updated_at: string }[]) {
    const list = statesByUser.get(r.profile_id) ?? [];
    list.push({ device: r.device, status: r.status, updatedAt: r.updated_at });
    statesByUser.set(r.profile_id, list);
  }
  const byUser = new Map<string, PushHealthPerson["devices"]>();
  for (const s of (subs ?? []) as PushSubscriptionRow[]) {
    const list = byUser.get(s.user_id) ?? [];
    list.push({
      id: s.id,
      device: s.device ?? null,
      created_at: s.created_at,
      last_seen_at: s.last_seen_at ?? null,
      last_ok_at: s.last_ok_at ?? null,
      last_error_at: s.last_error_at ?? null,
      last_error: s.last_error ?? null,
      last_delivered_at: s.last_delivered_at ?? null,
      last_delivery_ms: s.last_delivery_ms ?? null,
    });
    byUser.set(s.user_id, list);
  }
  return (people ?? []).map((p) => ({
      id: p.id as string,
      name: p.display_name as string,
      avatarUrl: (p.avatar_url as string | null) ?? null,
      role: (p.role as string | null) ?? null,
      devices: byUser.get(p.id as string) ?? [],
      states: statesByUser.get(p.id as string) ?? [],
    }));
}

// "Đo tín hiệu" beside one person: a test notification to each of their
// devices, with what each push service answered and when it left — the
// board then watches for each device to report it shown (getPushProbe).
// `probeId`: the same test also goes to their open workspaces (lib/pageNotify.ts);
// sharing the tag, a device that gets both shows one notification.
export async function sendTestPushTo(profileId: string, probeId?: string): Promise<{ sentAt: string; results: PushDeviceResult[] }> {
  const { user } = await requireHrManager();
  const sentAt = new Date().toISOString();
  const results = await sendPushToUser(profileId, {
    title: "Funti Kidbooks Studio · kiểm tra",
    body: "Thông báo thử từ quản lý — thấy tin này là máy bạn đang nhận thông báo tốt.",
    senderId: user.id,
    url: "/workspace",
    tag: "funti-test",
    messageId: probeId,
  });
  return { sentAt, results };
}

// The devices of these people that reported showing a notification since
// `since` (sw.js → /api/push/ack), and when the server heard it — the same
// clock as sendTestPushTo's sentAt, so a phone's own wrong clock can't skew it.
export async function getPushProbe(profileIds: string[], since: string): Promise<{ id: string; deliveredAt: string }[]> {
  await requireHrManager();
  if (profileIds.length === 0 || Number.isNaN(Date.parse(since))) return [];
  const { data } = await createAdminClient()
    .from("push_subscriptions")
    .select("id, last_delivered_at")
    .in("user_id", profileIds.slice(0, 100))
    .gte("last_delivered_at", since);
  return (data ?? []).map((d) => ({ id: d.id as string, deliveredAt: d.last_delivered_at as string }));
}
