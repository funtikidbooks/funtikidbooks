import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { LocaleProvider } from "@/components/site/LocaleProvider";
import { FacebookChat } from "@/components/site/FacebookChat";
import { ZaloButton } from "@/components/site/ZaloButton";
import { SupportChatWidget } from "@/components/site/SupportChatWidget";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/getLocale";
import type { AccessRole } from "@/lib/types";

async function getSessionInfo(): Promise<{ isAuthenticated: boolean; memberHref: string }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { isAuthenticated: false, memberHref: "/dang-nhap" };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { isAuthenticated: false, memberHref: "/dang-nhap" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("access_role")
      .eq("id", user.id)
      .maybeSingle();

    const accessRole = (profile?.access_role ?? "staff") as AccessRole;
    return { isAuthenticated: true, memberHref: accessRole === "admin" ? "/quan-tri" : "/workspace" };
  } catch {
    return { isAuthenticated: false, memberHref: "/dang-nhap" };
  }
}

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ isAuthenticated, memberHref }, locale] = await Promise.all([getSessionInfo(), getLocale()]);

  return (
    <LocaleProvider initialLocale={locale}>
      <Header isAuthenticated={isAuthenticated} memberHref={memberHref} />
      <main className="flex-1">{children}</main>
      <Footer locale={locale} />
      <ZaloButton />
      <FacebookChat />
      <SupportChatWidget />
    </LocaleProvider>
  );
}
