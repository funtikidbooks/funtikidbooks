import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FontAsset } from "@/lib/types";

export async function getFonts(): Promise<FontAsset[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("fonts").select("*").order("name", { ascending: true });
    return (data ?? []) as FontAsset[];
  } catch {
    return [];
  }
}
