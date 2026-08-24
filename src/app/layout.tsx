import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: {
    default: "Funti Kidbooks Studio",
    template: "%s · Funti Kidbooks Studio",
  },
  description:
    "Funti Kidbooks Studio đồng hành cùng tác giả, nhà xuất bản và thương hiệu tạo nên những cuốn sách thiếu nhi giàu hình ảnh và cảm xúc.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${headingFont.variable} ${beVietnamPro.variable} h-full antialiased`}
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
