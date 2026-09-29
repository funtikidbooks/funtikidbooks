import { clockDeviceFrom, clockJson } from "@/lib/clockDevice";
import { planScan, scanTime, screenFor, vnDate, type ClockDayRow } from "@/lib/clockMath";
import { LATE_GRACE_MINUTES, WORK_START_HOUR, WORK_START_MINUTE } from "@/lib/constants/attendance";

export const dynamic = "force-dynamic";

const RULES = { workStartMinutes: WORK_START_HOUR * 60 + WORK_START_MINUTE, graceMinutes: LATE_GRACE_MINUTES };

// A finger the sensor recognised: body { slot, at? } — `at` is the machine's
// own clock (seconds) for a scan it held while offline. Answers with the
// three lines the machine shows: title, a big line, a note.
export async function POST(request: Request) {
  const ctx = await clockDeviceFrom(request);
  if (!ctx) return clockJson({ error: "unauthorized" }, 401);
  const { admin, device } = ctx;
  const body = (await request.json().catch(() => ({}))) as { slot?: unknown; at?: unknown };
  const slot = Math.round(Number(body.slot));
  const now = new Date();
  const at = scanTime(body.at, now);

  await admin.from("clock_devices").update({ last_seen_at: now.toISOString() }).eq("id", device.id);
  const log = (profileId: string | null, result: string) =>
    admin.from("clock_scans").insert({ device_id: device.id, slot: Number.isFinite(slot) ? slot : null, profile_id: profileId, scanned_at: at.toISOString(), result });

  if (!Number.isFinite(slot) || slot < 1) return clockJson({ error: "slot" }, 400);

  const { data: finger } = await admin.from("clock_fingers").select("profile_id").eq("device_id", device.id).eq("slot", slot).maybeSingle();
  if (!finger) {
    await log(null, "unknown");
    return clockJson({ ok: false, title: "Van tay chua", big: "dang ky", note: `(so ${slot})`, tone: "error" });
  }

  const [{ data: person }, { data: row }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", finger.profile_id).maybeSingle(),
    admin
      .from("attendance")
      .select("id, status, check_in_at, check_out_at, check_in_source")
      .eq("profile_id", finger.profile_id)
      .eq("work_date", vnDate(at))
      .maybeSingle(),
  ]);

  const plan = planScan((row as ClockDayRow) ?? null, at);
  let error: { message: string } | null = null;
  if (plan.action === "check_in" && plan.insert) {
    ({ error } = await admin.from("attendance").insert({
      profile_id: finger.profile_id,
      work_date: vnDate(at),
      ...plan.patch,
    } as never));
  } else if (plan.action !== "repeat" && row) {
    ({ error } = await admin.from("attendance").update(plan.patch as never).eq("id", row.id));
  }
  if (error) {
    await log(finger.profile_id, `error: ${error.message}`.slice(0, 200));
    return clockJson({ ok: false, title: "Loi luu cham cong", big: "Thu lai", note: "", tone: "error" }, 500);
  }

  await log(finger.profile_id, plan.action);
  const dayOff = !!row && ["leave", "off", "paid_leave"].includes(row.status);
  return clockJson({ ok: true, action: plan.action, ...screenFor(plan, person?.display_name ?? "", at, RULES, dayOff) });
}
