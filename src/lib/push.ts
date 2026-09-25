import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

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

// "high" urgency is what lets a chat push through immediately — web-push's
// default ("normal") lets Android batch it until the phone's next Doze
// maintenance window, which can be minutes. TTL: a phone that's been off
// for over a day doesn't need yesterday's chat pings all arriving at once.
const PUSH_OPTIONS = { urgency: "high" as const, TTL: 60 * 60 * 24 };

// Sends a Web Push notification to every device a user has registered —
// a real OS notification even when the recipient's tab isn't open/focused,
// including on an iPad where the site was added to the Home Screen.
export async function sendPushToUser(userId: string, payload: PushPayload) {
  return sendPushToUsers([userId], payload);
}

// Same, for a whole room at once: one query for every recipient's devices
// instead of one query per recipient before a single push could go out.
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!ensureConfigured() || userIds.length === 0) return;

  const adminClient = createAdminClient();
  const { data: subs } = await adminClient.from("push_subscriptions").select("*").in("user_id", userIds);
  if (!subs || subs.length === 0) return;

  const json = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
          PUSH_OPTIONS,
        );
      } catch (err) {
        // 404/410 = the browser dropped this subscription (uninstalled,
        // permission revoked, etc.) — clean it up so we stop retrying it.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await adminClient.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }),
  );
}
