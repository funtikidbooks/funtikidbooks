import Script from "next/script";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { LocaleProvider } from "@/components/site/LocaleProvider";
import { ViewerProvider } from "@/components/site/ViewerProvider";

// GA4 — deliberately scoped to this (site) layout, not the root layout, so
// staff's own day-to-day clicks in /workspace and /quan-tri never mix into
// the same property as real visitor traffic. sếp Phúc's GA4 property,
// created 2026-09-23 — Measurement ID only, nothing else identifying.
const GA_MEASUREMENT_ID = "G-3W52NS2L9W";

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
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');`}
        </Script>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </LocaleProvider>
    </ViewerProvider>
  );
}
