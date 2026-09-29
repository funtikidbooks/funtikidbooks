import { clockDeviceFrom, clockJson } from "@/lib/clockDevice";
import { asciiFold } from "@/lib/clockMath";

export const dynamic = "force-dynamic";

// The machine asks every few seconds whether there's anything to do:
// "enrol this person in slot N" or "delete slot N" (queued from Quản trị →
// Chấm công). ?cap= and ?fw= report its fingerprint capacity and firmware.
export async function GET(request: Request) {
  const ctx = await clockDeviceFrom(request);
  if (!ctx) return clockJson({ error: "unauthorized" }, 401);
  const { admin, device } = ctx;
  const url = new URL(request.url);
  const cap = Math.round(Number(url.searchParams.get("cap")));
  const fw = (url.searchParams.get("fw") ?? "").slice(0, 20);
  await admin
    .from("clock_devices")
    .update({
      last_seen_at: new Date().toISOString(),
      ...(cap >= 10 && cap <= 1000 ? { capacity: cap } : {}),
      ...(fw ? { firmware: fw } : {}),
    })
    .eq("id", device.id);

  // Oldest first; a "running" one is resumed (the machine restarted mid-way).
  const { data: cmd } = await admin
    .from("clock_commands")
    .select("id, kind, slot, profile_id")
    .eq("device_id", device.id)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!cmd) return clockJson({ command: null });

  let name = "";
  if (cmd.profile_id) {
    const { data: p } = await admin.from("profiles").select("display_name").eq("id", cmd.profile_id).maybeSingle();
    name = asciiFold(p?.display_name ?? "").slice(0, 21);
  }
  return clockJson({ command: { id: cmd.id, kind: cmd.kind, slot: cmd.slot, name } });
}

// Progress on a command: body { id, status: "running" | "done" | "failed", step }.
// Answers { cancelled: true } when someone pressed Huỷ, so the machine stops.
export async function POST(request: Request) {
  const ctx = await clockDeviceFrom(request);
  if (!ctx) return clockJson({ error: "unauthorized" }, 401);
  const { admin, device } = ctx;
  const body = (await request.json().catch(() => ({}))) as { id?: string; status?: string; step?: string };
  const status = body.status === "done" || body.status === "failed" ? body.status : "running";
  const step = String(body.step ?? "").slice(0, 60);

  const { data: cmd } = await admin
    .from("clock_commands")
    .select("id, kind, slot, profile_id, status")
    .eq("id", String(body.id ?? ""))
    .eq("device_id", device.id)
    .maybeSingle();
  if (!cmd) return clockJson({ error: "not found" }, 404);
  if (cmd.status === "cancelled") return clockJson({ cancelled: true });

  await admin.from("clock_commands").update({ status, step, updated_at: new Date().toISOString() }).eq("id", cmd.id);
  await admin.from("clock_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);

  // A finger saved in the sensor now belongs to that person here too.
  if (status === "done" && cmd.kind === "enroll" && cmd.profile_id) {
    await admin
      .from("clock_fingers")
      .upsert({ device_id: device.id, slot: cmd.slot, profile_id: cmd.profile_id }, { onConflict: "device_id,slot" });
  }
  return clockJson({ ok: true, cancelled: false });
}
