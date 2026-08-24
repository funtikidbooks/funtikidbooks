import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getFonts } from "@/lib/data/fonts";
import { FontLibrary } from "@/components/workspace/FontLibrary";

export const metadata: Metadata = { title: "Kho font" };

export default async function KhoFontPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [fonts, { data: profile }] = await Promise.all([
    getFonts(),
    supabase.from("profiles").select("access_role").eq("id", user!.id).maybeSingle(),
  ]);

  return <FontLibrary initialFonts={fonts} isDirector={profile?.access_role === "director"} />;
}
