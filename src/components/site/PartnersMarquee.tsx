const PARTNERS = [
  "ĐINH TỊ",
  "NXB TRẺ",
  "KIM ĐỒNG",
  "TRÍ VIỆT",
  "AMAZON",
  "NHÃ NAM",
  "LIONBOOKS",
];

export function PartnersMarquee() {
  // Duplicated 8x (not just 2x) so each half of the strip is comfortably
  // wider than any real viewport, even ultra-wide monitors — otherwise the
  // loop shows a blank gap before it wraps back to the start.
  const loop = Array.from({ length: 8 }, () => PARTNERS).flat();

  return (
    <div className="overflow-hidden" style={{ maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)" }}>
      <div className="flex items-center gap-10 w-max fk-marquee">
        {loop.map((name, i) => (
          <span key={name + i} className="flex items-center gap-4 flex-none">
            <span className="font-heading font-bold text-lg" style={{ color: "var(--color-neutral-500)" }}>
              {name}
            </span>
            <span aria-hidden style={{ color: "var(--color-accent-400)" }}>
              •
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
