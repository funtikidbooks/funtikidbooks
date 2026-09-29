import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClockDevice } from "@/lib/types";

// The fingerprint machine proves itself with a long random secret made in
// Quản trị → Chấm công (shown once, pasted into its firmware); only its
// sha256 is stored. Server-only.

export const hashClockToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newClockToken = () => randomBytes(24).toString("base64url");

export async function clockDeviceFrom(request: Request): Promise<{ admin: ReturnType<typeof createAdminClient>; device: ClockDevice } | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token.length < 20) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("clock_devices").select("*").eq("token_hash", hashClockToken(token)).maybeSingle();
  if (!data) return null;
  return { admin, device: data as ClockDevice };
}

export const clockJson = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
