// Hand-drawn touches for the home page — a crayon underline, wavy paper
// edges between sections, little sparkles, and line icons that look drawn
// rather than picked from an icon set. All plain SVG in the site's own
// colours, so they follow the light/dark theme.

// A wobbly crayon stroke under a word; draws itself in once (fk-draw).
export function Squiggle({ className = "", color = "var(--color-accent-500)" }: { className?: string; color?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute left-0 w-full ${className}`}
      style={{ bottom: "-0.2em", height: "0.42em" }}
      viewBox="0 0 200 16"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        className="fk-draw"
        style={{ ["--len" as string]: 230 }}
        d="M3 11 C 28 3, 52 14, 78 8 S 128 3, 152 9 S 186 12, 197 5"
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
      />
    </svg>
  );
}

// The top edge of a section, cut like a wave of torn paper, in that
// section's own background colour — sits just above it.
export function WaveEdge({ fill, flip = false }: { fill: string; flip?: boolean }) {
  return (
    <svg
      className="block w-full"
      style={{ height: 28, marginBottom: -1, transform: flip ? "scaleX(-1)" : undefined }}
      viewBox="0 0 1440 28"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M0 18 C 90 6, 170 26, 262 16 S 430 4, 528 14 S 700 26, 812 15 S 990 3, 1098 13 S 1300 26, 1440 12 L1440 28 L0 28 Z"
        fill={fill}
      />
    </svg>
  );
}

export function Sparkle({ size = 18, color = "var(--color-accent-400)", className = "", style }: { size?: number; color?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path d="M12 1.5 C 13 8, 16 11, 22.5 12 C 16 13, 13 16, 12 22.5 C 11 16, 8 13, 1.5 12 C 8 11, 11 8, 12 1.5 Z" fill={color} />
    </svg>
  );
}

// A strip of masking tape holding a note or photo down.
export function Tape({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`absolute block ${className}`}
      style={{
        width: 74,
        height: 22,
        background: "color-mix(in srgb, var(--color-accent-200) 70%, transparent)",
        boxShadow: "0 1px 2px rgba(0,0,0,.06)",
        ...style,
      }}
      aria-hidden
    />
  );
}

// The four steps of the process, drawn with a slightly uneven pen.
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

// Small line icons in the same pen, in place of emoji.
export type DrawnIconName = "heart" | "star" | "hands" | "sprout" | "mail" | "phone" | "pin" | "clock" | "bulb" | "book" | "chat" | "users" | "palette";

export function DrawnIcon({ name, size = 28 }: { name: DrawnIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      {name === "heart" && <path {...stroke} d="M20 32.5 C 13 27.5, 6.5 22.5, 6.8 15.2 C 7 10.4, 10.6 7.4, 14.6 7.6 C 17.2 7.7, 19 9.4, 20 11.6 C 21.1 9.3, 23 7.6, 25.7 7.6 C 29.7 7.6, 33.2 10.8, 33.2 15.4 C 33.3 22.6, 26.8 27.6, 20 32.5 Z" />}
      {name === "star" && <path {...stroke} d="M20 5.8 L 24.2 14.6 L 33.8 15.8 L 26.7 22.4 L 28.6 31.9 L 20 27.1 L 11.5 32 L 13.3 22.4 L 6.2 15.9 L 15.8 14.6 Z" />}
      {name === "hands" && (
        <>
          <path {...stroke} d="M5.5 20.5 L 11 15 L 16.5 16.2 L 21.5 13.2 C 23.2 12.4, 25 12.6, 26.4 13.8 L 34.5 20.8" />
          <path {...stroke} d="M21.5 13.2 L 15.6 18.6 C 14.6 19.6, 15.6 21.6, 17.3 21 L 22 18.8 L 28.4 24.6 C 29.6 25.8, 28.4 27.6, 26.8 26.8 L 23.4 24.4 M 26.2 28.2 C 27 29.6, 25.6 31, 24.2 30.1 L 21 27.6 M 22.6 31.4 C 22.6 32.8, 21 33.2, 20 32.4 L 11.2 25.2 L 5.5 25.4" />
        </>
      )}
      {name === "sprout" && (
        <>
          <path {...stroke} d="M20 33.5 L 20 18.5" />
          <path {...stroke} d="M20 21 C 19.6 14.6, 15 10.6, 7.6 10.8 C 7.6 17.4, 12.4 21.4, 20 21 Z" />
          <path {...stroke} d="M20 18.6 C 20.6 12.2, 25 7.6, 32.6 7.8 C 32.4 14.6, 27.4 18.8, 20 18.6 Z" />
          <path {...stroke} d="M11.5 33.6 L 28.5 33.4" />
        </>
      )}
      {name === "mail" && (
        <>
          <path {...stroke} d="M6.6 11.4 C 6.8 10, 7.8 9.4, 9.4 9.4 L 30.8 9.2 C 32.4 9.2, 33.4 10.2, 33.4 11.8 L 33.2 28.4 C 33.2 29.8, 32.2 30.8, 30.6 30.8 L 9.2 30.8 C 7.6 30.8, 6.6 29.8, 6.6 28.2 Z" />
          <path {...stroke} d="M7.4 11.2 L 20 21.2 L 32.8 11" />
        </>
      )}
      {name === "phone" && (
        <path {...stroke} d="M11.8 6.8 L 15.8 6.6 L 18.4 13.6 L 15.2 16.2 C 16.8 20, 20 23.2, 23.8 24.8 L 26.4 21.6 L 33.4 24.2 L 33.2 28.2 C 33 30.8, 31 33.4, 27.6 33.2 C 17.4 32.4, 7.6 22.6, 6.8 12.4 C 6.6 9, 9.2 7, 11.8 6.8 Z" />
      )}
      {name === "pin" && (
        <>
          <path {...stroke} d="M20 34 C 14 27.4, 9 21.4, 9 15.8 C 9 9.8, 13.8 5.8, 20 5.8 C 26.2 5.8, 31 9.8, 31 15.8 C 31 21.4, 26 27.4, 20 34 Z" />
          <path {...stroke} d="M20 11.4 C 22.6 11.4, 24.4 13.2, 24.4 15.8 C 24.4 18.2, 22.6 20, 20 20 C 17.4 20, 15.6 18.2, 15.6 15.8 C 15.6 13.2, 17.4 11.4, 20 11.4 Z" />
        </>
      )}
      {name === "clock" && (
        <>
          <path {...stroke} d="M20 6.2 C 28 6.2, 33.8 12, 33.8 20 C 33.8 28, 28 33.8, 20 33.8 C 12 33.8, 6.2 28, 6.2 20 C 6.2 12, 12 6.2, 20 6.2 Z" />
          <path {...stroke} d="M20 11.6 L 20 20.4 L 26 23.6" />
        </>
      )}
      {name === "bulb" && (
        <>
          <path {...stroke} d="M15.4 27.4 C 15.2 23.8, 10.2 21.4, 10.2 15.6 C 10.2 10, 14.6 6.2, 20 6.2 C 25.4 6.2, 29.8 10, 29.8 15.6 C 29.8 21.4, 24.8 23.8, 24.6 27.4 Z" />
          <path {...stroke} d="M16 31.2 L 24 31 M 17.6 34.4 L 22.4 34.2" />
        </>
      )}
      {name === "book" && (
        <>
          <path {...stroke} d="M20 11.5 C 16 8.6, 11 8, 5.8 9 L 5.6 30 C 11 29, 16 29.6, 20 32.4 C 24 29.6, 29 29, 34.4 30 L 34.2 9 C 29 8, 24 8.6, 20 11.5 Z" />
          <path {...stroke} d="M20 11.5 L 20 32.2" />
        </>
      )}
      {name === "chat" && (
        <>
          <path {...stroke} d="M7 10.5 C 7.5 7, 11 6, 20 6.2 C 30 6, 33.5 7.5, 33.2 13 L 33 21 C 33 25, 30 26.5, 24 26.3 L 16 26.5 L 10 32.5 L 11 26.2 C 8 25.5, 6.8 23.5, 7 20 Z" />
          <path {...stroke} d="M13 14.5 L 27 14.2 M13 19.4 L 23 19.2" />
        </>
      )}
      {name === "users" && (
        <>
          <path {...stroke} d="M15 18.4 C 18 18.4, 20.2 16, 20.2 13 C 20.2 10, 18 7.8, 15 7.8 C 12 7.8, 9.8 10, 9.8 13 C 9.8 16, 12 18.4, 15 18.4 Z" />
          <path {...stroke} d="M5.4 32.2 C 5.8 26, 9.6 22.4, 15 22.4 C 20.4 22.4, 24.2 26, 24.6 32.2" />
          <path {...stroke} d="M25.4 18 C 28 18, 29.8 16, 29.8 13.4 C 29.8 10.8, 28 9, 25.6 9 M 28 22.6 C 31.6 23.4, 34.2 26.6, 34.6 31.8" />
        </>
      )}
      {name === "palette" && (
        <>
          <path {...stroke} d="M20 6.4 C 28.4 6.2, 34 11.8, 33.8 18.6 C 33.6 23.4, 30 25, 26.8 24.2 C 24.2 23.6, 22.4 25.8, 23.8 28.4 C 25.2 31.2, 23 33.8, 19.6 33.6 C 11.6 33.2, 6.2 27.2, 6.4 19.8 C 6.6 12.2, 12.4 6.6, 20 6.4 Z" />
          <path {...stroke} d="M13.2 17.4 L 13.4 17.6 M 18.4 12 L 18.6 12.2 M 25.6 13.2 L 25.8 13.4 M 13.8 24.2 L 14 24.4" />
        </>
      )}
    </svg>
  );
}

export function StepIcon({ step, size = 34 }: { step: 0 | 1 | 2 | 3; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      {step === 0 && (
        // A speech bubble — talking the story through.
        <>
          <path {...stroke} d="M7 10.5 C 7.5 7, 11 6, 20 6.2 C 30 6, 33.5 7.5, 33.2 13 L 33 21 C 33 25, 30 26.5, 24 26.3 L 16 26.5 L 10 32.5 L 11 26.2 C 8 25.5, 6.8 23.5, 7 20 Z" />
          <path {...stroke} d="M13 14.5 L 27 14.2 M13 19.4 L 23 19.2" />
        </>
      )}
      {step === 1 && (
        // A pencil.
        <>
          <path {...stroke} d="M8.5 31.5 L 10.2 24.5 L 26.5 8.2 C 28 6.8, 30.2 6.9, 31.6 8.4 C 33 9.8, 33.1 12, 31.7 13.4 L 15.4 29.8 Z" />
          <path {...stroke} d="M24 10.8 L 29.2 16 M10.2 24.5 L 15.4 29.8" />
        </>
      )}
      {step === 2 && (
        // A brush with a drop of paint.
        <>
          <path {...stroke} d="M30.5 6.5 C 26 10, 20.5 15.5, 17.2 19.6 L 20.6 23 C 24.6 19.6, 30 14, 33.4 9.6 C 34.4 8.2, 32 5.4, 30.5 6.5 Z" />
          <path {...stroke} d="M17.2 19.6 C 13.2 19.2, 10.6 21.6, 10.4 25.2 C 10.2 28.4, 8.6 30.4, 6.5 31.2 C 11 33.8, 18.6 32.4, 20.6 23" />
        </>
      )}
      {step === 3 && (
        // An open book.
        <>
          <path {...stroke} d="M20 11.5 C 16 8.6, 11 8, 5.8 9 L 5.6 30 C 11 29, 16 29.6, 20 32.4 C 24 29.6, 29 29, 34.4 30 L 34.2 9 C 29 8, 24 8.6, 20 11.5 Z" />
          <path {...stroke} d="M20 11.5 L 20 32.2" />
        </>
      )}
    </svg>
  );
}
