import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getFonts } from "@/lib/data/fonts";
import { getBrushes } from "@/lib/data/brushes";
import { FontBrushLibrary } from "@/components/workspace/FontBrushLibrary";

export const metadata: Metadata = { title: "Kho font & brush" };

export default async function KhoFontPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [fonts, brushes, { data: profile }] = await Promise.all([
    getFonts(),
    getBrushes(),
    supabase.from("profiles").select("access_role").eq("id", user!.id).maybeSingle(),
  ]);

  return (
    <FontBrushLibrary
      initialFonts={fonts}
      initialBrushes={brushes}
      currentUserId={user!.id}
      isDirector={profile?.access_role === "director"}
    />
  );
}
