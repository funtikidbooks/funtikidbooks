import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Trying out the director's custom heading typeface — swap back to Baloo_2
// from next/font/google (variable: "--font-heading") if this doesn't stick.
const headingFont = localFont({
  src: "./fonts/1FTV-VIP-Honera.ttf",
  variable: "--font-heading",
  display: "swap",
});

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-body",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const SITE_URL = "https://funtikidbooks.com";
const SITE_NAME = "Funti Kidbooks Studio";
const SITE_DESCRIPTION =
  "Funti Kidbooks Studio đồng hành cùng tác giả, nhà xuất bản và thương hiệu tạo nên những cuốn sách thiếu nhi giàu hình ảnh và cảm xúc. Minh hoạ sách thiếu nhi, thiết kế nhân vật, dàn trang chuẩn KDP/Amazon.";

export const metadata: Metadata = {
  // Required for og:image/twitter:image to resolve as absolute URLs — every
  // relative path elsewhere in metadata is resolved against this.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - Đơn vị vẽ sách minh hoạ thiếu nhi tràn đầy nhiệt huyết và năng lượng!`,
    template: "%s · Funti Kidbooks Studio",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "minh hoạ sách thiếu nhi",
    "thiết kế nhân vật",
    "dàn trang sách",
    "thiết kế bìa sách",
    "minh hoạ sách KDP Amazon",
    "children's book illustration",
    "Funti Kidbooks",
  ],
  manifest: "/manifest.json",
  // Lets "Add to Home Screen" on iPad/iPhone launch the workspace as a
  // standalone app — required for Web Push notifications to work on iOS.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Funti Workspace",
  },
  // Serving favicon.ico from public/ (a plain static file, no processing)
  // rather than the app/favicon.ico convention — Next's built-in icon
  // pipeline choked trying to re-encode this file's embedded PNG payload.
  icons: {
    icon: "/favicon.ico",
    apple: "/brand/funti-logo.jpg",
  },
  // Powers the preview card when a link is shared on Facebook/Zalo/Messenger.
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [{ url: "/brand/funti-logo.jpg", width: 1175, height: 1174, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/brand/funti-logo.jpg"],
  },
  verification: {
    google: "OkwGTpZsOoCyp-W2Mo0Qj3XSIWq5qsOAdTs2GdxOPhs",
  },
};

// Tints the browser/OS chrome (address bar, app switcher card) with the
// brand color. Zoom stays enabled here — this is the public site, and
// disabling it would hurt anyone who needs to pinch-zoom to read comfortably.
// The workspace layout overrides this with app-like, zoom-disabled settings
// of its own; this is just the shared default everything else inherits.
export const viewport: Viewport = {
  themeColor: "#e8674a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      // `height: 100%` on the root element resolves on iOS Safari against
      // the large (toolbar-collapsed) viewport, not what's actually visible
      // — the same historical bug as 100vh. Since `body` below is
      // `min-h-full` (a percentage of this), it inherited that oversized
      // floor too, leaving the page just tall enough to rubber-band scroll
      // on iOS whenever the toolbar was showing — which is what still let
      // the workspace's fixed bottom nav drift even after that shell was
      // capped to 100dvh. `100dvh` here tracks the real visible height so
      // nothing downstream gets an inflated floor to scroll into.
      className={`${headingFont.variable} ${beVietnamPro.variable} h-[100dvh] antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          // Runs before paint so a saved dark-mode choice never flashes light first.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("funti-theme");if(t==="dark")document.documentElement.setAttribute("data-theme","dark");}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
