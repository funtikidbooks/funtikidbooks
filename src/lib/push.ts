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

// Sends a Web Push notification to every device a user has registered.
// Used from the server action that saves a new direct message — pushes a
// real OS notification even when the recipient's tab isn't open/focused,
// including on an iPad where the site was added to the Home Screen.
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; senderId: string; url?: string; tag?: string },
) {
  if (!ensureConfigured()) return;

  const adminClient = createAdminClient();
  const { data: subs } = await adminClient.from("push_subscriptions").select("*").eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  const json = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
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
