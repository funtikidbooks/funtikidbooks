"use server";

import { requireUser } from "@/lib/supabase/server";
import { hashClockToken, newClockToken } from "@/lib/clockDevice";
import { WEB_CHECKIN_KEY } from "@/lib/constants/attendance";
import type { ClockCommand, ClockDevice, ClockFinger, ClockScan } from "@/lib/types";

// Quản trị → Chấm công → Máy chấm công vân tay. Director or the Project
// Manager — the same people as the rest of Chấm công (can_manage_hr()).
async function requireHrManager() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") throw new Error("Bạn không có quyền này.");
  return { supabase, isDirector: profile?.access_role === "director" };
}

export type ClockOverview = {
  // false until supabase/migrations/fingerprint_clock.sql has been run.
  ready: boolean;
  devices: Omit<ClockDevice, "token_hash">[];
  fingers: ClockFinger[];
  commands: ClockCommand[];
  scans: ClockScan[];
  webCheckIn: boolean;
  isDirector: boolean;
};

export async function getClockOverview(): Promise<ClockOverview> {
  const { supabase, isDirector } = await requireHrManager();
  const [devices, fingers, commands, scans, setting] = await Promise.all([
    supabase.from("clock_devices").select("id, name, capacity, last_seen_at, firmware, created_at").order("created_at"),
    supabase.from("clock_fingers").select("*").order("slot"),
    supabase.from("clock_commands").select("*").order("created_at", { ascending: false }).limit(40),
    supabase.from("clock_scans").select("*").order("scanned_at", { ascending: false }).limit(15),
    supabase.from("site_settings").select("value").eq("key", WEB_CHECKIN_KEY).maybeSingle(),
  ]);
  return {
    ready: !devices.error,
    devices: (devices.data ?? []) as ClockOverview["devices"],
    fingers: (fingers.data ?? []) as ClockFinger[],
    commands: (commands.data ?? []) as ClockCommand[],
    scans: (scans.data ?? []) as ClockScan[],
    webCheckIn: setting.data?.value !== "off",
    isDirector,
  };
}

// A new machine: its secret is returned once, to paste into the firmware.
export async function addClockDevice(name: string): Promise<{ id: string; token: string }> {
  const { supabase } = await requireHrManager();
  const token = newClockToken();
  const { data, error } = await supabase
    .from("clock_devices")
    .insert({ name: name.trim().slice(0, 60) || "Máy chấm công", token_hash: hashClockToken(token) })
    .select("id")
    .single();
  if (error || !data) throw new Error("Không thêm được máy — đã chạy SQL fingerprint_clock.sql chưa?");
  return { id: data.id, token };
}

// Lost the secret, or it leaked: a new one, and the old stops working.
export async function resetClockToken(deviceId: string): Promise<string> {
  const { supabase } = await requireHrManager();
  const token = newClockToken();
  const { error } = await supabase.from("clock_devices").update({ token_hash: hashClockToken(token) }).eq("id", deviceId);
  if (error) throw new Error("Không đổi được mã kết nối.");
  return token;
}

export async function renameClockDevice(deviceId: string, name: string) {
  const { supabase } = await requireHrManager();
  await supabase.from("clock_devices").update({ name: name.trim().slice(0, 60) || "Máy chấm công" }).eq("id", deviceId);
}

export async function removeClockDevice(deviceId: string) {
  const { supabase } = await requireHrManager();
  await supabase.from("clock_devices").delete().eq("id", deviceId);
}

// Queue "enrol this person" on a machine, in the lowest slot nobody holds
// (nor is about to).
export async function startEnroll(deviceId: string, profileId: string): Promise<{ commandId: string; slot: number }> {
  const { supabase } = await requireHrManager();
  const [{ data: device }, { data: fingers }, { data: queued }] = await Promise.all([
    supabase.from("clock_devices").select("capacity").eq("id", deviceId).maybeSingle(),
    supabase.from("clock_fingers").select("slot").eq("device_id", deviceId),
    supabase.from("clock_commands").select("slot").eq("device_id", deviceId).eq("kind", "enroll").in("status", ["pending", "running"]),
  ]);
  if (!device) throw new Error("Không tìm thấy máy.");
  const used = new Set([...(fingers ?? []), ...(queued ?? [])].map((r) => r.slot));
  let slot = 1;
  while (used.has(slot) && slot <= device.capacity) slot++;
  if (slot > device.capacity) throw new Error("Máy đã đầy vân tay.");
  const { data, error } = await supabase
    .from("clock_commands")
    .insert({ device_id: deviceId, kind: "enroll", slot, profile_id: profileId })
    .select("id")
    .single();
  if (error || !data) throw new Error("Không gửi được lệnh cho máy.");
  return { commandId: data.id, slot };
}

export async function cancelClockCommand(commandId: string) {
  const { supabase } = await requireHrManager();
  await supabase
    .from("clock_commands")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", commandId)
    .in("status", ["pending", "running"]);
}

// Forget a finger here at once (it stops counting straight away) and have
// the machine wipe its slot the next time it checks in.
export async function removeClockFinger(fingerId: string) {
  const { supabase } = await requireHrManager();
  const { data: f } = await supabase.from("clock_fingers").select("device_id, slot").eq("id", fingerId).maybeSingle();
  if (!f) return;
  await supabase.from("clock_fingers").delete().eq("id", fingerId);
  await supabase.from("clock_commands").insert({ device_id: f.device_id, kind: "delete", slot: f.slot });
}

// Whether opening the workspace still checks people in (the director's call).
export async function setWebCheckIn(on: boolean) {
  const { supabase, isDirector } = await requireHrManager();
  if (!isDirector) throw new Error("Chỉ Giám đốc đổi được cài đặt này.");
  const { error } = await supabase.from("site_settings").upsert({ key: WEB_CHECKIN_KEY, value: on ? "on" : "off" });
  if (error) throw new Error("Không lưu được cài đặt.");
}
