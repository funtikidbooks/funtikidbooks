import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { LocaleProvider } from "@/components/site/LocaleProvider";
import { ViewerProvider } from "@/components/site/ViewerProvider";
import { FacebookChat } from "@/components/site/FacebookChat";
import { ZaloButton } from "@/components/site/ZaloButton";
import { SupportChatWidget } from "@/components/site/SupportChatWidget";

// No cookies()/auth check here on purpose — that's what let this layout
// (and every static page under it) drop out of dynamic rendering. Locale
// and login state are resolved client-side instead; see LocaleProvider and
// ViewerProvider.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewerProvider>
      <LocaleProvider>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <ZaloButton />
        <FacebookChat />
        <SupportChatWidget />
      </LocaleProvider>
    </ViewerProvider>
  );
}
