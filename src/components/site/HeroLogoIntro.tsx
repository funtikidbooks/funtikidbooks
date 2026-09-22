"use client";

// Sits above the hero headline — sếp Phúc reviewed this as a standalone
// animation prototype first (mascot drops in, "Funti" hops up letter by
// letter, "KID BOOKS" pops up as one cluster), then asked for it centered
// right above "Kể chuyện bằng tranh". Every layer is a same-size,
// same-aspect transparent PNG cut from the studio's own logo (public/brand
// /logo-intro/*.png) — each one already carries its correct position
// within that shared frame, so stacking them at inset:0 lines everything
// up with no per-layer offsets to hand-tune.
//
// Plain <img>, not next/image: these are already pre-sized (320px) small
// PNGs with nothing left for Vercel's optimizer to usefully shrink, and
// the site had already burned through its monthly Image Optimization
// quota once before (see resizedUrl()'s own comment in lib/imageTransform.ts)
// — every next/image request 402s once that happens, homepage included,
// so this stays off that path entirely rather than risk it again.
//
// Keyframes live in globals.css (fk-logo-intro-*) since this plays once on
// mount, not on scroll — no need for the Reveal component's
// IntersectionObserver.
const LAYERS = [
  { cls: "fk-logo-intro-mascot", src: "/brand/logo-intro/mascot.png" },
  { cls: "fk-logo-intro-letter-F", src: "/brand/logo-intro/letter-F.png" },
  { cls: "fk-logo-intro-letter-u", src: "/brand/logo-intro/letter-u.png" },
  { cls: "fk-logo-intro-letter-n", src: "/brand/logo-intro/letter-n.png" },
  { cls: "fk-logo-intro-letter-t", src: "/brand/logo-intro/letter-t.png" },
  { cls: "fk-logo-intro-letter-i", src: "/brand/logo-intro/letter-i.png" },
  { cls: "fk-logo-intro-subtitle", src: "/brand/logo-intro/subtitle.png" },
];

export function HeroLogoIntro() {
  return (
    <div className="relative flex-none" style={{ width: 112, height: 112 }} aria-hidden>
      <div
        className="fk-logo-intro-stage-bg absolute rounded-full"
        style={{ inset: "4%", background: "rgba(255,255,255,.14)" }}
      />
      <div
        className="fk-logo-intro-ring absolute rounded-full"
        style={{ left: "50%", top: "46%", width: "40%", height: "40%", border: "2.5px solid rgba(245,167,66,.55)", transform: "translate(-50%,-50%)" }}
      />
      {LAYERS.map(({ cls, src }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          className={`fk-logo-intro-layer ${cls}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
        />
      ))}
    </div>
  );
}
