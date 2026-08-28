"use server";

import { SignJWT, importPKCS8 } from "jose";
import { createClient } from "@/lib/supabase/server";

// JaaS (8x8.vc, Jitsi-as-a-Service) needs a per-call, per-user signed JWT so
// the first person into a room is trusted as moderator without anyone
// logging into Jitsi/Google — that "please log in to become moderator"
// screen is exactly what this replaces. Falls back to null (meaning: use the
// plain meet.jit.si embed, no JWT) until JAAS_APP_ID/JAAS_API_KEY_ID/
// JAAS_PRIVATE_KEY are configured, so this is safe to ship ahead of having
// real JaaS credentials.
export async function getJaasCallCredentials(): Promise<{ appId: string; jwt: string } | null> {
  const appId = process.env.JAAS_APP_ID;
  const apiKeyId = process.env.JAAS_API_KEY_ID;
  const privateKeyRaw = process.env.JAAS_PRIVATE_KEY;
  if (!appId || !apiKeyId || !privateKeyRaw) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();

  // Vercel env vars can't hold real newlines, so the PEM is stored with
  // literal "\n" sequences and unescaped here.
  const privateKey = await importPKCS8(privateKeyRaw.replace(/\\n/g, "\n"), "RS256");

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    context: {
      user: {
        id: user.id,
        name: profile?.display_name ?? "Funtikidbooks",
        moderator: true,
      },
      features: {
        livestreaming: false,
        recording: false,
        transcription: false,
        "outbound-call": false,
      },
    },
    room: "*",
  })
    .setProtectedHeader({ alg: "RS256", kid: apiKeyId, typ: "JWT" })
    .setIssuer("chat")
    .setAudience("jitsi")
    .setSubject(appId)
    .setIssuedAt(now)
    .setNotBefore(now - 10)
    .setExpirationTime(now + 60 * 60 * 2)
    .sign(privateKey);

  return { appId, jwt };
}
