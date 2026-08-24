"use client";

import { useEffect, useRef, useState } from "react";

// Fades + slides a block into place the first time it scrolls into view —
// used across the public site so content arrives smoothly instead of
// popping in as the visitor scrolls, rather than a page-specific effect.
// Reduced-motion users just get the content, no animation.
export function Reveal({
  children,
  className,
  style,
  delay = 0,
  x = 0,
  y = 24,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  x?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Deferred a frame rather than called synchronously here, so this
      // stays a "reacting to an external system" update, not a render
      // triggered straight from the effect body.
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? "translate(0, 0)" : `translate(${x}px, ${y}px)`,
        transition: "opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)",
        transitionDelay: `${delay}ms`,
        willChange: visible ? undefined : "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
