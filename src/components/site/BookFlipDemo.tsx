"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// 0 lying flat (0deg or -180deg), peaking as the page stands on edge at
// -90deg — drives the shadow that gathers along the page's far edge as it
// bends away from flat, the cue that reads as paper rather than a rigid card.
function foldAmount(rotationDeg: number) {
  return Math.abs(Math.sin((rotationDeg * Math.PI) / 180));
}

type Leaf = { front: string | null; back: string | null };

// Real books have leaves, not single-sided "pages", and a leaf's own front
// and back never face the reader at once — only the back of one leaf and the
// front of the next do, side by side, once the first has been turned. So a
// page pair that must be seen together (e.g. a spread pre-split into a left
// and right half) has to straddle a leaf boundary, not share one leaf: the
// cover's back holds the first content page, each following leaf's back
// holds the next, and the final leftover page rides on the trailing leaf
// alongside the real back-cover art so it too can be turned, ending the book
// closed on a single centered page the same way it started.
function buildLeaves(pages: string[], backCover: string | null): Leaf[] {
  const leaves: Leaf[] = [];
  if (pages.length === 0) return leaves;
  leaves.push({ front: pages[0], back: pages[1] ?? null });
  let i = 2;
  while (i + 1 < pages.length) {
    leaves.push({ front: pages[i], back: pages[i + 1] });
    i += 2;
  }
  leaves.push({ front: i < pages.length ? pages[i] : null, back: backCover });
  return leaves;
}

const PAGE_WIDTH = "min(78vw, 340px)";
const OPEN_PAGE_WIDTH = "min(39vw, 340px)";
// Matches the reference book's own proportions — a taller portrait page,
// not a square one.
const PAGE_ASPECT_RATIO = "668 / 854";
// How many distinct page-flip sound takes live under /public/sounds/ as
// page-flip-1.mp3 .. page-flip-N.mp3, cycled at random so flips don't all
// sound identical.
const FLIP_SOUND_VARIANTS = 7;

// A single flat image, with a soft shadow gathering along its far edge as
// it nears edge-on (90deg into the flip) — this catches-shadow cue is what
// reads as paper bending away from flat. The spine-shading strip lives
// INSIDE this same rounded+clipped box (not as a sibling outside it) — a
// sibling strip isn't clipped by the rounded corner below it and pokes out
// past it as a sharp, wrongly-colored point at the top/bottom corner.
function PageSurface({
  src,
  alt,
  rotation,
  spineSide,
  isCover,
}: {
  src: string | null;
  alt: string;
  rotation: number;
  spineSide: "left" | "right";
  isCover?: boolean;
}) {
  const fold = foldAmount(rotation);
  return (
    <div className="absolute inset-0 rounded-[10px] overflow-hidden">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} draggable={false} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: "#fdfcf8" }} />
      )}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(90deg, transparent 35%, rgba(0,0,0,.5) 100%)", opacity: fold }}
        aria-hidden
      />
      {isCover && (
        // Hardcover books are scored a little way in from the spine so the
        // board can hinge open — a thin groove, not a shadow gradient. Only
        // the rigid covers get this; paper interior pages have no hinge.
        <div
          className="absolute inset-y-0"
          style={{
            [spineSide]: "9%",
            width: 3,
            background:
              spineSide === "left"
                ? "linear-gradient(90deg, rgba(0,0,0,.3), rgba(255,255,255,.5) 55%, transparent)"
                : "linear-gradient(-90deg, rgba(0,0,0,.3), rgba(255,255,255,.5) 55%, transparent)",
          }}
          aria-hidden
        />
      )}
      <div
        className="absolute inset-y-0"
        style={{
          [spineSide]: 0,
          width: "8%",
          background: spineSide === "left" ? "linear-gradient(90deg, rgba(0,0,0,.15), transparent)" : "linear-gradient(-90deg, rgba(0,0,0,.15), transparent)",
        }}
        aria-hidden
      />
    </div>
  );
}

// A real book gets thicker on the read side and thinner on the unread side
// as you go — by the last page, the whole stack has moved to the left and
// there's nothing left to show on the right. `progress` is how "full" this
// side's stack is (0 = no pages here, 1 = the whole stack): the shadow and
// the layered paper-edge slivers both scale off it, offset toward
// bottom-left for the read stack and bottom-right for the unread one so
// each peeks out away from the spine, not into it.
function PageStack({ progress, side }: { progress: number; side: "left" | "right" }) {
  const dir = side === "right" ? 1 : -1;
  const layers = [
    { x: 9, y: 11, color: "#ddd5c2" },
    { x: 7, y: 9, color: "#e6ded0" },
    { x: 5.5, y: 7, color: "#ddd5c2" },
    { x: 4, y: 5, color: "#e6ded0" },
    { x: 2, y: 2.5, color: "#f2ede1" },
  ];
  return (
    <>
      <div
        className="absolute rounded-[10px]"
        style={{
          inset: 0,
          transform: `translate(${dir * 11 * progress}px, ${19 * progress}px)`,
          background: "radial-gradient(closest-side, rgba(20,16,12,.45), rgba(20,16,12,0) 100%)",
          filter: "blur(15px)",
          opacity: progress,
        }}
        aria-hidden
      />
      {layers.map((l, i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-[10px]"
          style={{ background: l.color, transform: `translate(${dir * l.x * progress}px, ${l.y * progress}px)` }}
          aria-hidden
        />
      ))}
    </>
  );
}

export function BookFlipDemo({ pages, alt, backCover = null }: { pages: string[]; alt: string; backCover?: string | null }) {
  const leaves = useMemo(() => buildLeaves(pages, backCover), [pages, backCover]);
  const [flipped, setFlipped] = useState(0); // number of leaves turned so far
  // The single leaf that's currently animating and its live rotation.
  // Everything else is settled at exactly 0 or -180.
  const [animLeaf, setAnimLeaf] = useState<number | null>(null);
  const [animRotation, setAnimRotation] = useState(0);
  const rafRef = useRef<number | null>(null);
  const flipSoundsRef = useRef<HTMLAudioElement[]>([]);
  const lastFlipSoundRef = useRef<number>(-1);

  useEffect(() => {
    flipSoundsRef.current = Array.from({ length: FLIP_SOUND_VARIANTS }, (_, i) => {
      const audio = new Audio(`/sounds/page-flip-${i + 1}.mp3`);
      audio.volume = 0.5;
      return audio;
    });
  }, []);

  function playFlipSound() {
    const sounds = flipSoundsRef.current;
    if (sounds.length === 0) return;
    let index = Math.floor(Math.random() * sounds.length);
    if (sounds.length > 1 && index === lastFlipSoundRef.current) {
      index = (index + 1) % sounds.length;
    }
    lastFlipSoundRef.current = index;
    const audio = sounds[index];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  const canForward = flipped < leaves.length;
  const canBack = flipped > 0;

  function cancelAnim() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function animateTo(leaf: number, from: number, to: number, onDone: () => void) {
    cancelAnim();
    setAnimLeaf(leaf);
    setAnimRotation(from);
    const start = performance.now();
    const duration = 550;
    function tick(now: number) {
      const t = clamp((now - start) / duration, 0, 1);
      setAnimRotation(from + (to - from) * easeOutCubic(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        onDone();
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function clickForward() {
    if (!canForward || rafRef.current !== null) return;
    playFlipSound();
    animateTo(flipped, 0, -180, () => {
      setFlipped((n) => Math.min(leaves.length, n + 1));
      setAnimLeaf(null);
    });
  }
  function clickBack() {
    if (!canBack || rafRef.current !== null) return;
    playFlipSound();
    animateTo(flipped - 1, -180, 0, () => {
      setFlipped((n) => Math.max(0, n - 1));
      setAnimLeaf(null);
    });
  }

  useEffect(() => cancelAnim, []);

  // The two-page spread layout (left slot + narrower pages) only applies
  // while actually between covers — settled at the very front or the very
  // back, it's a single centered page again, same size as the closed cover.
  // While a flip is animating, though, the spread stays up regardless of
  // where `flipped` itself is: the very first flip (leaving the front
  // cover) and the very last one (landing on the back cover) both need the
  // leaf to travel across the spine into the left slot, which only exists
  // when this is true.
  const isOpenSpread = flipped > 0 && flipped < leaves.length;
  const showSpread = isOpenSpread || animLeaf !== null;
  const isClosedAtEnd = flipped === leaves.length && animLeaf === null;
  const pageWidth = showSpread ? OPEN_PAGE_WIDTH : PAGE_WIDTH;

  // Only the leaf actually sweeping across the spine right now needs to
  // outrank everything else. Everything at rest keeps the plain scheme,
  // since the left pile and the right pile never overlap when neither is
  // in motion.
  function zIndexFor(j: number) {
    return j === animLeaf ? 1000 : j < flipped ? 100 + j : leaves.length - j;
  }

  return (
    <div className="w-full flex items-center justify-center gap-4 sm:gap-8">
      <button
        type="button"
        onClick={clickBack}
        disabled={!canBack}
        aria-label="Trang trước"
        className="flex items-center justify-center rounded-full flex-none transition-opacity disabled:opacity-30"
        style={{ width: 44, height: 44, background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" }}
      >
        ‹
      </button>

      {/* The left slot and the right container must sit flush against each
          other with zero gap between them — the rotated leaf that paints
          the left slot's pixels is positioned purely relative to the right
          container's own left edge (one container-width to its left), with
          no idea that a flex `gap` might have pushed the left slot's own
          box further away. Any gap here and the thickness/shadow decor
          (anchored to the left slot's box) drifts out of alignment with
          the actual page content sitting on top of it. So this pair gets
          its own zero-gap flex wrapper, nested inside the outer row that
          still keeps its gap to the arrow buttons on either side. */}
      <div className="flex">
        {/* Left slot: mostly layout spacing — the page pixels themselves
            are painted by whichever leaf is currently turned all the way
            over (rotateY(-180) about its own left edge lands it exactly
            here) — but it also carries the read-side's own shadow and
            paper-stack thickness, which only grows as more leaves pile up
            on this side. */}
        {showSpread && (
          <div className="relative" style={{ width: pageWidth, aspectRatio: PAGE_ASPECT_RATIO, flex: "none" }} aria-hidden>
            <PageStack progress={Math.min(flipped, leaves.length) / leaves.length} side="left" />
          </div>
        )}

        <div className="relative flex-none" style={{ width: pageWidth, aspectRatio: PAGE_ASPECT_RATIO, perspective: 1800 }}>
        {isClosedAtEnd ? (
          // Settled fully closed on the back cover — a single centered
          // page, same as the front cover, not the rotation trick (which
          // only lands correctly one container-width to the left of a
          // right-hand slot that doesn't exist once the spread is gone).
          <>
            <PageStack progress={1} side="left" />
            <PageSurface src={leaves[leaves.length - 1].back} alt={`${alt} — bìa sau`} rotation={0} spineSide="left" isCover />
          </>
        ) : (
          <>
        {/* The unread side's shadow and paper-stack thickness — shrinks to
            nothing by the last page, since there's nothing left to stack. */}
        <PageStack progress={(leaves.length - flipped) / leaves.length} side="right" />

        {/* Render order follows the same priority as z-index, not the
            leaves' natural index order. Belt-and-suspenders: some engines
            don't reliably honor z-index between sibling elements that each
            carry their own preserve-3d/perspective 3D transform — putting
            the top-ranked leaf last in the DOM as well means it still
            paints on top even where the z-index alone doesn't win. */}
        {leaves
          .map((leaf, j) => j)
          .sort((a, b) => zIndexFor(a) - zIndexFor(b))
          .map((j) => {
            const leaf = leaves[j];
            const rotation = j === animLeaf ? animRotation : j < flipped ? -180 : 0;
            const frontPageLabel = j === 0 ? "bìa" : `trang ${2 * j - 1}`;
            const backPageLabel = `trang ${2 * j}`;
            // Belt-and-suspenders on top of backface-visibility: some
            // engines don't reliably cull the "wrong" face during a live
            // 3D animation, letting it bleed through as a tilted ghost.
            // Explicit visibility, driven straight off the current angle,
            // doesn't depend on the browser's 3D backface culling at all.
            const frontVisible = rotation >= -90;
            const isCover = j === 0 || j === leaves.length - 1;
            return (
              // Two-sided card: a front face (odd page / cover) and a back
              // face (even page, or blank for the cover and any leftover
              // odd leaf), each independently backface-hidden and the back
              // pre-rotated 180deg so that once the card has turned past
              // 90deg, the back renders right side up — not mirrored, not
              // the front's content bleeding through — the same way a
              // physical flipped leaf shows its other side rather than
              // vanishing.
              <div
                key={j}
                className="absolute inset-0"
                style={{
                  transformStyle: "preserve-3d",
                  transformOrigin: "left center",
                  transform: `rotateY(${rotation}deg)`,
                  zIndex: zIndexFor(j),
                  pointerEvents: "none",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{ backfaceVisibility: "hidden", visibility: frontVisible ? "visible" : "hidden" }}
                >
                  {/* The front face isn't pre-rotated, so its own local
                      "left" edge lands on-screen at the spine as-is. */}
                  <PageSurface src={leaf.front} alt={`${alt} — ${frontPageLabel}`} rotation={rotation} spineSide="left" isCover={isCover} />
                </div>
                <div
                  className="absolute inset-0"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    visibility: frontVisible ? "hidden" : "visible",
                  }}
                >
                  {/* The back face carries its own 180deg pre-rotation
                      (around its own center) so its content reads right
                      side up once the leaf has fully turned. That extra
                      rotation also swaps which local edge ends up at the
                      spine on screen — its local "left" lands at the far
                      outer edge instead, so the spine shading has to be
                      authored on the "right" here to end up in the right
                      place once everything composes. */}
                  <PageSurface
                    src={leaf.back}
                    alt={`${alt} — ${backPageLabel}`}
                    rotation={rotation}
                    spineSide="right"
                    isCover={isCover}
                  />
                </div>
              </div>
            );
          })}
          </>
        )}
        </div>
      </div>

      <button
        type="button"
        onClick={clickForward}
        disabled={!canForward}
        aria-label="Trang tiếp theo"
        className="flex items-center justify-center rounded-full flex-none transition-opacity disabled:opacity-30"
        style={{ width: 44, height: 44, background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" }}
      >
        ›
      </button>
    </div>
  );
}
