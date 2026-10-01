import https from "node:https";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PushSubscriptionRow } from "@/lib/types";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  senderId: string;
  url?: string;
  tag?: string;
  // Android/desktop keep the notification on screen until it's tapped or
  // dismissed instead of letting it disappear on its own — see sw.js. iOS
  // ignores this and falls back to its own default behavior regardless.
  requireInteraction?: boolean;
};

// Kept-open connections to Apple/Google/Mozilla/Microsoft's push servers:
// a warm function reuses them instead of a fresh TLS handshake (a few
// hundred ms to Apple) for every device of every message.
const agent = new https.Agent({ keepAlive: true, maxSockets: 64 });

// "high" urgency is what lets a chat push through immediately — web-push's
// default ("normal") lets Android batch it until the phone's next Doze
// maintenance window, which can be minutes. TTL: a phone that's been off
// for over a day doesn't need yesterday's chat pings all arriving at once.
// timeout: one push service that never answers mustn't hold the others'
// bookkeeping (or the function) hostage.
const PUSH_OPTIONS = { urgency: "high" as const, TTL: 60 * 60 * 24, timeout: 10_000, agent };

export type PushDeviceResult = { id: string; device: string | null; ok: boolean; status: number | null; error: string | null; removed: boolean };

// Sends a Web Push notification to every device a user has registered —
// a real OS notification even when the recipient's tab isn't open/focused,
// including on an iPad where the site was added to the Home Screen.
export async function sendPushToUser(userId: string, payload: PushPayload) {
  return sendPushToUsers([userId], payload);
}

// Same, for a whole room at once: one query for every recipient's devices
// instead of one query per recipient before a single push could go out.
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<PushDeviceResult[]> {
  if (!ensureConfigured() || userIds.length === 0) return [];
  const { data: subs } = await createAdminClient().from("push_subscriptions").select("*").in("user_id", userIds);
  return sendPushToSubscriptions((subs ?? []) as PushSubscriptionRow[], payload);
}

// The devices already in hand (chatPush loads them alongside everything
// else a message needs). Every push carries the moment it left (sentAt):
// the device reports back when it showed it (sw.js → /api/push/ack), which
// is how Quản trị → Thông báo trên máy knows each device's real delay.
// Every outcome is written back on the device (last_ok_at / last_error —
// push_health.sql); a device the push service says is gone (404/410) is
// removed.
export async function sendPushToSubscriptions(subs: PushSubscriptionRow[], payload: PushPayload): Promise<PushDeviceResult[]> {
  if (!ensureConfigured() || subs.length === 0) return [];
  const adminClient = createAdminClient();

  const json = JSON.stringify({ ...payload, sentAt: Date.now() });
  const results = await Promise.all(
    subs.map(async (sub): Promise<PushDeviceResult> => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
          PUSH_OPTIONS,
        );
        return { id: sub.id, device: sub.device ?? null, ok: true, status: 201, error: null, removed: false };
      } catch (err) {
        const e = err as { statusCode?: number; body?: string; message?: string };
        const status = e.statusCode ?? null;
        // 404/410 = the browser dropped this subscription (uninstalled,
        // permission revoked, etc.) — clean it up so we stop retrying it.
        const removed = status === 404 || status === 410;
        if (removed) await adminClient.from("push_subscriptions").delete().eq("id", sub.id);
        const error = `${status ?? "mạng"}: ${String(e.body || e.message || "lỗi").replace(/\s+/g, " ").slice(0, 160)}`;
        return { id: sub.id, device: sub.device ?? null, ok: false, status, error, removed };
      }
    }),
  );

  // Bookkeeping, best effort — before push_health.sql runs the columns
  // don't exist and these just fail quietly.
  const now = new Date().toISOString();
  const okIds = results.filter((r) => r.ok).map((r) => r.id);
  const failed = results.filter((r) => !r.ok && !r.removed);
  await Promise.all([
    okIds.length > 0 ? adminClient.from("push_subscriptions").update({ last_ok_at: now }).in("id", okIds) : null,
    ...failed.map((r) => adminClient.from("push_subscriptions").update({ last_error_at: now, last_error: r.error }).eq("id", r.id)),
  ]).catch(() => {});

  return results;
}
