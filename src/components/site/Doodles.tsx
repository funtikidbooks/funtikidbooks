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
