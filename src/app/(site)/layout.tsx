import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { LocaleProvider } from "@/components/site/LocaleProvider";
import { ViewerProvider } from "@/components/site/ViewerProvider";

// No cookies()/auth check here on purpose — that's what let this layout
// (and every static page under it) drop out of dynamic rendering. Locale
// and login state are resolved client-side instead; see LocaleProvider and
// ViewerProvider.
//
// The floating Zalo/Messenger/"Hỗ trợ" buttons (ZaloButton, FacebookChat,
// SupportChatWidget) are deliberately not rendered here per sếp Phúc — not
// needed for now. Components left untouched, so re-adding is just restoring
// the imports + three JSX lines below.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewerProvider>
      <LocaleProvider>
        <Header />
        <main className="flex-1 fk-crayon">{children}</main>
        <Footer />
      </LocaleProvider>
    </ViewerProvider>
  );
}
