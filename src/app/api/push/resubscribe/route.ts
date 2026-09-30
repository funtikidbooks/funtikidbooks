import { replacePushSubscription } from "@/lib/actions/push";

export const dynamic = "force-dynamic";

// Called by sw.js on "pushsubscriptionchange": the browser expired or
// rotated this device's push subscription — often while the app is closed —
// and the new one has to be saved or the device silently stops getting
// notifications. The service worker can't call a Server Action, hence a
// route; it's same-origin, so the staff member's session cookie comes along.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    oldEndpoint?: string | null;
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    device?: string;
  } | null;
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) return new Response(null, { status: 400 });
  try {
    await replacePushSubscription(
      body.oldEndpoint ?? null,
      { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } },
      body.device,
    );
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 401 });
  }
}
