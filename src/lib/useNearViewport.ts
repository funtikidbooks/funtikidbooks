"use client";

import { useEffect, useState, type RefObject } from "react";

// Becomes the element's width (CSS px) once it comes within `rootMargin` of
// the screen, and stays that way — for a CSS background picture, which the
// browser otherwise downloads with the page no matter how far down it sits
// (unlike an <img loading="lazy">). null until then.
export function useNearViewport(ref: RefObject<Element | null>, rootMargin = "400px"): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || width !== null) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (!hit) return;
        setWidth(hit.boundingClientRect.width);
        io.disconnect();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, width]);
  return width;
}
