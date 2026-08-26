import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BrushAsset } from "@/lib/types";

export async function getBrushes(): Promise<BrushAsset[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("brushes").select("*").order("name", { ascending: true });
    return (data ?? []) as BrushAsset[];
  } catch {
    return [];
  }
}
