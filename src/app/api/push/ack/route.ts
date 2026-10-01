import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// A device saying "I just showed a notification" (sw.js, on every push):
// its own subscription endpoint, when the server sent it (sentAt, in the
// payload) and when the device received it. Kept on that device's row —
// Quản trị → Thông báo trên máy shows each device's real delay from it,
// which is the only way to see a phone that receives late (a summary
// schedule, battery saver, a browser not running) rather than guess.
// No session needed: the endpoint itself identifies the device, and all
// this can change is those two numbers on it.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown; sentAt?: unknown; receivedAt?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const sentAt = Number(body?.sentAt);
  const receivedAt = Number(body?.receivedAt);
  if (!/^https:\/\/\S{10,1000}$/.test(endpoint) || !Number.isFinite(sentAt) || !Number.isFinite(receivedAt)) {
    return new Response(null, { status: 400 });
  }
  // Clocks differ a little between server and phone — never below zero,
  // and a week means "arrived when the phone came back", not a number.
  const delay = Math.round(Math.min(Math.max(receivedAt - sentAt, 0), 7 * 24 * 3600 * 1000));
  after(async () => {
    await createAdminClient()
      .from("push_subscriptions")
      .update({ last_delivered_at: new Date().toISOString(), last_delivery_ms: delay })
      .eq("endpoint", endpoint);
  });
  return new Response(null, { status: 204 });
}
