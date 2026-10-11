"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// A <Link> that only prefetches when someone is about to use it.
//
// The default <Link> prefetches every link that scrolls into view. On a
// dynamic page that is a request to the server — a Vercel function call —
// per link, and the sidebar / bottom bar put ~15 of them on every page, so
// one page view fanned out into a dozen invocations of the free plan's
// 1,000,000-a-month budget. Here nothing is fetched on sight; pointing at the
// link (mouse), focusing it (keyboard) or touching it (phone/iPad) starts the
// prefetch, so clicking still feels instant and unused links cost nothing.
export function IntentLink({ href, onMouseEnter, onFocus, onTouchStart, ...rest }: ComponentProps<typeof Link>) {
  const router = useRouter();
  // Object hrefs (pathname + query) are not used by the nav — only warm plain strings.
  const warm = () => {
    if (typeof href === "string") router.prefetch(href);
  };
  return (
    <Link
      {...rest}
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
    />
  );
}
