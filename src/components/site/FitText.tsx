"use client";

import { useEffect, useRef, useState } from "react";

// Scales text down to fit its container's actual width — never wraps or
// overflows, regardless of how wide a given font renders the same string.
export function FitText({
  text,
  className = "",
  style,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const ro = new ResizeObserver(() => {
      const available = container.clientWidth;
      const natural = textEl.scrollWidth;
      if (available > 0 && natural > 0) {
        setScale(Math.min(1, (available / natural) * 0.98));
      }
    });
    ro.observe(container);
    ro.observe(textEl);
    return () => ro.disconnect();
  }, [text, className]);

  return (
    <div ref={containerRef} className="w-full flex justify-center overflow-hidden">
      <span
        ref={textRef}
        className={className}
        style={{ ...style, whiteSpace: "nowrap", display: "inline-block", transform: `scale(${scale})` }}
      >
        {text}
      </span>
    </div>
  );
}
