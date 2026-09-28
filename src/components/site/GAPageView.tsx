"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// gtag('config', ID) with no options auto-fires page_view on load AND
// listens for History API changes globally — once loaded, that listener
// keeps firing on every client-side route change for as long as the tab
// stays open, including a client-side navigation into /workspace or
// /quan-tri (Next.js doesn't unload the script just because a different
// route group is now rendering). That's how staff's own workspace clicks
// were leaking into "Trang được xem nhiều nhất" despite the GA script
// only being added to THIS layout — sếp Phúc caught /workspace sitting at
// #2 in the traffic dashboard.
//
// Fixed by disabling that automatic listener (send_page_view: false, set
// where gtag('config', ...) is called) and firing page_view manually from
// here instead. This component only exists inside the (site) layout tree,
// so it unmounts the moment a client-side navigation leaves for
// /workspace or /quan-tri — no more page_view calls after that, same as
// a full reload landing outside (site) never having loaded gtag at all.
//
// GA4's enhanced measurement ("page changes based on browser history
// events", on by default in the GA admin) still counted a client-side hop
// from a public page into /workspace — a few staff views a day kept
// showing up after the fix above. Google's own opt-out flag switches every
// hit off while no (site) page is mounted, and back on when one is.
export function GAPageView({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const flag = `ga-disable-${measurementId}`;
    (window as unknown as Record<string, boolean>)[flag] = false;
    return () => {
      (window as unknown as Record<string, boolean>)[flag] = true;
    };
  }, [measurementId]);

  useEffect(() => {
    if (typeof window.gtag !== "function") return;
    const query = searchParams.toString();
    window.gtag("event", "page_view", {
      page_path: query ? `${pathname}?${query}` : pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}
