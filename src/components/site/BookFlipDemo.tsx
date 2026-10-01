"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useNearViewport } from "@/lib/useNearViewport";
import { resizedSrcSet, resizedUrl } from "@/lib/imageTransform";

// The originals are ~1.5MB each: pages come resized, at the copy that fits
// the page as shown (at most 544px wide, so 1100px stays sharp on Retina;
// a phone's ~300px page takes the 720px copy).
const PAGE_WIDTHS = [480, 720, 1100];
function pageImage(src: string, sizes: string) {
  return { src: resizedUrl(src, 1100) ?? src, srcSet: resizedSrcSet(src, PAGE_WIDTHS), sizes };
}

// A picture book you turn by hand. Drag a page (mouse), swipe it (finger),
// tap it, or use the arrows. Paper pages curl from the corner you pull:
// the page is folded along the perpendicular bisector of where its corner
// started and where it is now, the folded-over part showing the page's
// other side, with shading along the fold. The two covers are boards and
// swing on their hinge instead. Everything is plain DOM — two positioned
// images per leaf, a clip-path and a 2D matrix each — recomputed only while
// something moves; nothing runs while the book lies still.

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smoothstep = (t: number) => t * t * (3 - 2 * t);

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

const MAX_PAGE = 544;
// The reference book's own proportions — a taller portrait page.
const ASPECT = 854 / 668;
const ARROW = 44;
// How far (× page height) a turning corner swings in toward the middle of
// the page — what makes the fold a diagonal curl rather than a straight crease.
const CURL = 0.16;
// px/ms: a quick swipe turns the page however short it was (past FLICK_MIN px).
const FLICK = 0.3;
const FLICK_MIN = 20;
const DRAG_START = 6;
// How many distinct page-flip sound takes live under /public/sounds/ as
// page-flip-1.mp3 .. page-flip-N.mp3, cycled at random so flips don't all
// sound identical.
const FLIP_SOUND_VARIANTS = 7;

type Pt = { x: number; y: number };
// A 2D affine map in CSS matrix(a, b, c, d, e, f) order:
// x' = a·x + c·y + e, y' = b·x + d·y + f.
type Aff = [number, number, number, number, number, number];
type Dir = 1 | -1;
type Corner = 0 | 1; // top | bottom

// Positions are in "turn space": the moving leaf laid out as if it lay on
// the right — x from the spine outward, y down — as fractions of the page.
// A back turn is the same picture mirrored.
type Soft = { kind: "soft"; leaf: number; dir: Dir; corner: Corner; u: number; v: number };
// p: how far a board has swung toward the left (0 lying right, 1 lying left).
type Hard = { kind: "hard"; leaf: number; dir: Dir; p: number };
type Motion = { kind: "rest" } | Soft | Hard;
const REST: Motion = { kind: "rest" };

const ID: Aff = [1, 0, 0, 1, 0, 0];
const mirror = (w: number): Aff => [-1, 0, 0, 1, w, 0];

// m ∘ k — apply k first.
function compose(m: Aff, k: Aff): Aff {
  return [
    m[0] * k[0] + m[2] * k[1],
    m[1] * k[0] + m[3] * k[1],
    m[0] * k[2] + m[2] * k[3],
    m[1] * k[2] + m[3] * k[3],
    m[0] * k[4] + m[2] * k[5] + m[4],
    m[1] * k[4] + m[3] * k[5] + m[5],
  ];
}
const apply = (m: Aff, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

// Mirror across the line through M with unit normal n.
function reflectAcross(M: Pt, n: Pt): Aff {
  const k = 2 * (M.x * n.x + M.y * n.y);
  return [1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.y, 1 - 2 * n.y * n.y, k * n.x, k * n.y];
}

// The part of a convex polygon on one side of the line through M with normal n.
function clipHalf(poly: Pt[], M: Pt, n: Pt, keep: 1 | -1): Pt[] {
  const side = (p: Pt) => keep * ((p.x - M.x) * n.x + (p.y - M.y) * n.y);
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function toCircle(p: Pt, c: Pt, r: number): Pt {
  const d = Math.hypot(p.x - c.x, p.y - c.y);
  return d <= r ? p : { x: c.x + ((p.x - c.x) * r) / d, y: c.y + ((p.y - c.y) * r) / d };
}

const cssMatrix = (m: Aff) => `matrix(${m.map((v) => Math.round(v * 1e4) / 1e4).join(",")})`;
const cssPolygon = (pts: Pt[]) => `polygon(${pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(",")})`;

// Where a paper page is, part-way through a turn. The pulled corner C has
// moved to P; the page folds along the line halfway between them, and the
// part beyond that line (C's side) lies mirrored across it, showing the
// leaf's other face. P is kept where paper bound at the spine can reach —
// no farther from either end of the spine than the page's own corners are.
function softGeometry(m: Soft, W: number, H: number) {
  const cy = m.corner === 0 ? 0 : H;
  const C = { x: W, y: cy };
  const travel = clamp((1 - m.u) / 2, 0, 1);
  let P: Pt = {
    x: Math.min(W, m.u * W),
    y: clamp(m.v * H + (m.corner === 0 ? 1 : -1) * CURL * H * Math.sin(Math.PI * travel), 0, H),
  };
  const hinge = { x: 0, y: cy };
  const far = { x: 0, y: H - cy };
  P = toCircle(toCircle(toCircle(P, hinge, W), far, Math.hypot(W, H)), hinge, W);

  const len = Math.hypot(C.x - P.x, C.y - P.y);
  if (len < 0.5) return null;
  const n = { x: (C.x - P.x) / len, y: (C.y - P.y) / len };
  const t = { x: -n.y, y: n.x };
  const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };
  const page = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  const kept = clipHalf(page, M, n, -1);
  const folded = clipHalf(page, M, n, 1);

  // Turn space → the moving slot's own box, and → the hidden face's own
  // image (its spine edge is on the other side from the showing face's).
  const toSlot = m.dir === 1 ? ID : mirror(W);
  const toFlap = m.dir === 1 ? mirror(W) : ID;
  const progress = clamp((W - P.x) / (2 * W), 0, 1);

  // A long band whose left edge lies on the fold line, running into the
  // folded side — for the shading on the flap and the shadow it casts.
  const L = W + H;
  const band: Aff = [n.x, n.y, t.x, t.y, M.x - L * t.x, M.y - L * t.y];
  const k = Math.min(1, 2.5 * (1 - progress));
  const s = Math.min(1, 3 * (1 - progress)) * Math.min(1, progress * 14);

  return {
    keptClip: kept.length >= 3 ? cssPolygon(kept.map((p) => apply(toSlot, p))) : null,
    flap:
      folded.length >= 3
        ? {
            transform: cssMatrix(compose(toSlot, compose(reflectAcross(M, n), toFlap))),
            clipPath: cssPolygon(folded.map((p) => apply(toFlap, p))),
            // Dark at the fold, a sheen, then shade again — the paper's curve.
            shade: {
              left: 0,
              top: 0,
              width: W * 0.6,
              height: 2 * L,
              transformOrigin: "0 0",
              transform: cssMatrix(compose(toFlap, band)),
              background: `linear-gradient(to right, rgba(0,0,0,${0.3 * k}) 0%, rgba(0,0,0,${0.05 * k}) 10%, rgba(255,255,255,${0.16 * k}) 22%, rgba(0,0,0,${0.12 * k}) 48%, rgba(0,0,0,0) 100%)`,
            } as CSSProperties,
          }
        : null,
    // The lifted paper's shadow on the page underneath, along the fold.
    cast: {
      left: 0,
      top: 0,
      width: W * (0.06 + 0.5 * progress),
      height: 2 * L,
      transformOrigin: "0 0",
      transform: cssMatrix(compose(toSlot, band)),
      background: `linear-gradient(to right, rgba(0,0,0,${0.42 * s}) 0%, rgba(0,0,0,${0.12 * s}) 40%, rgba(0,0,0,0) 100%)`,
    } as CSSProperties,
  };
}

// Page size and where the book sits. Closed, the book is one page wide and
// centered (and on a narrow screen larger, since there's only one page to
// show); it slides and settles to a two-page spread as the cover opens.
function bookLayout(avail: number, flipped: number, n: number, motion: Motion) {
  const narrow = avail < 640;
  const gap = narrow ? 0 : avail >= 960 ? 32 : 16;
  // On a phone the spread fills the width, less a little for the paper edges.
  const room = Math.max(160, avail - (narrow ? 16 : 2 * (ARROW + gap)));
  const openW = Math.min(MAX_PAGE, Math.floor(room / 2));
  const closedW = Math.max(openW, Math.min(MAX_PAGE, Math.floor(room * (narrow ? 0.8 : 1))));

  let open = flipped > 0 && flipped < n ? 1 : 0;
  let side = flipped === 0 ? -1 : 1; // which end the book is closed at
  if (motion.kind === "hard" && motion.leaf === 0) {
    open = smoothstep(motion.p);
    side = -1;
  } else if (motion.kind === "hard" && motion.leaf === n - 1) {
    open = smoothstep(1 - motion.p);
    side = 1;
  }
  const W = lerp(closedW, openW, open);
  const H = W * ASPECT;
  const spine = avail / 2 + side * (W / 2) * (1 - open);
  return {
    narrow,
    gap,
    W,
    H,
    spine,
    visLeft: spine - W * (side === -1 ? open : 1),
    visRight: spine + W * (side === 1 ? open : 1),
  };
}

function PageSurface({
  src,
  alt,
  width,
  spineSide,
  isCover,
  children,
}: {
  src: string | null;
  alt: string;
  // The page as shown, in CSS px — picks the image size.
  width: number;
  spineSide: "left" | "right";
  isCover?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="absolute inset-0 rounded-[10px] overflow-hidden" style={{ background: "#fdfcf8" }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img {...pageImage(src, `${Math.round(width)}px`)} alt={alt} draggable={false} decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      )}
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
      {children}
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

type Hit = { leaf: number; dir: Dir; corner: Corner; zone: boolean };
type Drag = {
  id: number;
  x0: number;
  y0: number;
  from: Motion;
  dir: Dir;
  started: boolean;
  samples: { t: number; x: number }[];
  W: number;
  H: number;
};

export function BookFlipDemo({ pages, alt, backCover = null }: { pages: string[]; alt: string; backCover?: string | null }) {
  const leaves = useMemo(() => buildLeaves(pages, backCover), [pages, backCover]);
  const n = leaves.length;
  const isHard = (j: number) => j === 0 || j === n - 1;

  const wrapRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  const [flipped, setFlipped] = useState(0); // leaves turned so far
  // Pages download as the reader gets to them — the cover and first spread
  // at the start, then always two leaves ahead of the open page. Every page
  // (~1.8MB on a phone) used to load with the home page, before anyone had
  // even turned the cover. Once loaded a page stays (no reload on turning back).
  const [loadedThrough, setLoadedThrough] = useState(1);
  if (flipped + 2 > loadedThrough && flipped > 0) setLoadedThrough(flipped + 2);
  const [motion, setMotion] = useState<Motion>(REST);
  const [dragging, setDragging] = useState(false);

  // The handlers work off refs: a turn can finish, and the next begin,
  // between two renders.
  const flippedRef = useRef(0);
  const motionRef = useRef<Motion>(REST);
  const tweenRef = useRef<number | null>(null);
  const flushRef = useRef<number | null>(null);
  const finishRef = useRef<(() => void) | null>(null); // completes the turn under way at once
  const peelRef = useRef<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const reducedRef = useRef(false);
  const soundsRef = useRef<HTMLAudioElement[]>([]);
  const lastSoundRef = useRef(-1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setAvail(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The flip sounds (~90KB) load as the book nears the screen, not with
  // the page — on a phone it sits well below the first screen.
  const bookNear = useNearViewport(wrapRef, "300px") !== null;
  useEffect(() => {
    if (!bookNear || soundsRef.current.length > 0) return;
    soundsRef.current = Array.from({ length: FLIP_SOUND_VARIANTS }, (_, i) => {
      const audio = new Audio(`/sounds/page-flip-${i + 1}.mp3`);
      audio.volume = 0.5;
      return audio;
    });
  }, [bookNear]);

  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
      if (flushRef.current !== null) cancelAnimationFrame(flushRef.current);
    };
  }, []);

  const L = bookLayout(avail, flipped, n, motion);
  const { W, H } = L;

  function playFlipSound() {
    const sounds = soundsRef.current;
    if (sounds.length === 0) return;
    let index = Math.floor(Math.random() * sounds.length);
    if (sounds.length > 1 && index === lastSoundRef.current) index = (index + 1) % sounds.length;
    lastSoundRef.current = index;
    const audio = sounds[index];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function setNow(m: Motion) {
    motionRef.current = m;
    setMotion(m);
  }
  // While dragging: at most one render per frame, however fast the pointer reports.
  function queue(m: Motion) {
    motionRef.current = m;
    if (flushRef.current === null)
      flushRef.current = requestAnimationFrame(() => {
        flushRef.current = null;
        setMotion(motionRef.current);
      });
  }
  function stopTween() {
    if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
    tweenRef.current = null;
  }
  function finishNow() {
    finishRef.current?.();
  }
  function animate(from: Motion, to: Motion, ms: number, ease: (t: number) => number, done: () => void) {
    stopTween();
    const t0 = performance.now();
    const step = (now: number) => {
      const t = ms <= 0 ? 1 : clamp((now - t0) / ms, 0, 1);
      const e = ease(t);
      setNow(
        from.kind === "soft" && to.kind === "soft"
          ? { ...to, u: lerp(from.u, to.u, e), v: lerp(from.v, to.v, e) }
          : from.kind === "hard" && to.kind === "hard"
            ? { ...to, p: lerp(from.p, to.p, e) }
            : to,
      );
      if (t < 1) tweenRef.current = requestAnimationFrame(step);
      else {
        tweenRef.current = null;
        done();
      }
    };
    tweenRef.current = requestAnimationFrame(step);
  }

  const restOf = (leaf: number, dir: Dir, corner: Corner): Motion =>
    isHard(leaf) ? { kind: "hard", leaf, dir, p: dir === 1 ? 0 : 1 } : { kind: "soft", leaf, dir, corner, u: 1, v: corner };
  const sameTurn = (m: Motion, leaf: number, dir: Dir) => m.kind !== "rest" && m.leaf === leaf && m.dir === dir;
  // 0 lying where it started, 1 turned all the way over.
  const travelOf = (m: Motion) => (m.kind === "soft" ? (1 - m.u) / 2 : m.kind === "hard" ? (m.dir === 1 ? m.p : 1 - m.p) : 0);

  function turn(dir: Dir, corner: Corner, style: "tap" | "release") {
    finishNow();
    const f = flippedRef.current;
    const leaf = dir === 1 ? f : f - 1;
    if (leaf < 0 || leaf >= n) return;
    const cur = motionRef.current;
    const from = sameTurn(cur, leaf, dir) ? cur : restOf(leaf, dir, corner);
    const to: Motion = from.kind === "soft" ? { ...from, u: -1, v: from.corner } : from.kind === "hard" ? { ...from, p: dir === 1 ? 1 : 0 } : from;
    const left = 1 - travelOf(from);
    const ms = reducedRef.current ? 180 : style === "tap" ? 480 + 420 * left : 160 + 560 * left;
    peelRef.current = null;
    playFlipSound();
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      finishRef.current = null;
      flippedRef.current = f + dir;
      setFlipped(f + dir);
      setNow(REST);
    };
    finishRef.current = () => {
      stopTween();
      done();
    };
    animate(from, to, ms, style === "tap" ? easeInOutCubic : easeOutCubic, done);
  }

  // Let go too early: the page falls back where it was.
  function settle() {
    const cur = motionRef.current;
    if (cur.kind === "rest") return;
    const home = restOf(cur.leaf, cur.dir, cur.kind === "soft" ? cur.corner : 0);
    animate(cur, home, reducedRef.current ? 120 : 140 + 420 * travelOf(cur), easeOutCubic, () => setNow(REST));
  }

  // Which page a point is on, and whether it's near a corner you'd pick up.
  function hitTest(clientX: number, clientY: number): Hit | null {
    const box = bookRef.current?.getBoundingClientRect();
    if (!box) return null;
    const x = clientX - box.left;
    const y = clientY - box.top;
    if (y < 0 || y > H || x < 0 || x > 2 * W) return null;
    const f = flippedRef.current;
    const dir: Dir | null = x >= W ? (f < n ? 1 : null) : f > 0 ? -1 : null;
    if (dir === null) return null;
    const leaf = dir === 1 ? f : f - 1;
    const hard = isHard(leaf);
    const xf = dir === 1 ? x - W : W - x; // distance from the spine
    const corner: Corner = hard || y < H / 2 ? 0 : 1;
    const z = Math.max(36, 0.2 * W);
    return { leaf, dir, corner, zone: xf > W - z && (hard || y < z || y > H - z) };
  }

  // Mouse over a corner: it lifts a little, to show the page can be pulled.
  function peelTo(hit: Hit | null) {
    if (finishRef.current || dragRef.current) return;
    const key = hit ? `${hit.leaf}:${hit.dir}:${hit.corner}` : null;
    if (key === peelRef.current) return;
    peelRef.current = key;
    if (!hit) {
      settle();
      return;
    }
    const base = restOf(hit.leaf, hit.dir, hit.corner);
    const r = Math.min(0.12 * W, 60);
    const to: Motion =
      base.kind === "hard"
        ? { ...base, p: base.dir === 1 ? 0.045 : 0.955 }
        : base.kind === "soft"
          ? { ...base, u: 1 - r / W, v: base.corner === 0 ? r / H : 1 - r / H }
          : base;
    const cur = motionRef.current;
    const from = sameTurn(cur, hit.leaf, hit.dir) && (cur.kind !== "soft" || cur.corner === hit.corner) ? cur : base;
    animate(from, to, reducedRef.current ? 0 : 200, easeOutCubic, () => {});
  }

  // One gesture, whatever reports it: the mouse through pointer events,
  // fingers and pens through touch events (below).
  function gestureStart(id: number, x: number, y: number) {
    finishNow();
    const hit = hitTest(x, y);
    if (!hit) return false;
    stopTween();
    const cur = motionRef.current;
    const from = sameTurn(cur, hit.leaf, hit.dir) ? cur : restOf(hit.leaf, hit.dir, hit.corner);
    dragRef.current = { id, x0: x, y0: y, from, dir: hit.dir, started: false, samples: [{ t: performance.now(), x }], W, H };
    return true;
  }

  // Returns whether the gesture is the book's — a sideways pull — so a
  // finger's move can be kept from scrolling the page.
  function gestureMove(id: number, x: number, y: number) {
    const d = dragRef.current;
    if (!d || d.id !== id) return false;
    const dx = x - d.x0;
    const dy = y - d.y0;
    if (!d.started) {
      // Mostly up or down: the reader is scrolling past, not turning.
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        dragRef.current = null;
        settle();
        return false;
      }
      if (Math.abs(dx) < DRAG_START) return Math.abs(dx) >= 3 && Math.abs(dx) > Math.abs(dy);
      d.started = true;
      peelRef.current = null;
      setDragging(true);
    }
    const now = performance.now();
    d.samples.push({ t: now, x });
    while (d.samples.length > 2 && now - d.samples[0].t > 90) d.samples.shift();

    const f = d.from;
    if (f.kind === "hard") queue({ ...f, p: clamp(f.p - dx / (d.W * 1.2), 0, 1) });
    else if (f.kind === "soft")
      queue({ ...f, u: clamp(f.u + (d.dir === 1 ? dx : -dx) / d.W, -1, 1), v: clamp(f.v + dy / d.H, 0, 1) });
    return true;
  }

  function gestureEnd(id: number, x: number) {
    const d = dragRef.current;
    if (!d || d.id !== id) return;
    dragRef.current = null;
    const corner: Corner = d.from.kind === "soft" ? d.from.corner : 1;
    if (!d.started) {
      turn(d.dir, corner, "tap");
      return;
    }
    setDragging(false);
    const now = performance.now();
    d.samples.push({ t: now, x });
    while (d.samples.length > 2 && now - d.samples[0].t > 90) d.samples.shift();
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const v = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    const toward = d.dir === 1 ? -v : v; // px/ms in the direction of the turn
    const swiped = toward > FLICK && Math.abs(x - d.x0) > FLICK_MIN;
    if (swiped || (travelOf(motionRef.current) > 0.3 && toward > -FLICK)) turn(d.dir, corner, "release");
    else settle();
  }

  function gestureCancel(id: number | null) {
    const d = dragRef.current;
    if (!d || (id !== null && d.id !== id)) return;
    dragRef.current = null;
    setDragging(false);
    settle();
  }

  // Mouse only — a finger's pointer events are left alone: Safari on
  // iPhone/iPad takes a moving finger for its own scrolling and cancels
  // them, so touch is read from touch events instead.
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (!gestureStart(e.pointerId, e.clientX, e.clientY)) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // the pointer is already gone
    }
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    if (dragRef.current) gestureMove(e.pointerId, e.clientX, e.clientY);
    else if (e.buttons === 0) {
      const hit = hitTest(e.clientX, e.clientY);
      peelTo(hit?.zone ? hit : null);
    }
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") gestureEnd(e.pointerId, e.clientX);
  }
  function onPointerCancel(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") gestureCancel(e.pointerId);
  }

  // Touch listeners are bound by hand: the move handler has to be allowed
  // to stop the page scrolling once a finger is pulling a page sideways
  // (React's touch handlers are passive). They call the latest gesture
  // functions through a ref, since those close over this render's sizes.
  const gestureRef = useRef({ gestureStart, gestureMove, gestureEnd, gestureCancel });
  useEffect(() => {
    gestureRef.current = { gestureStart, gestureMove, gestureEnd, gestureCancel };
  });
  const ready = avail > 0;
  useEffect(() => {
    const el = bookRef.current;
    if (!ready || !el) return;
    const touchId = (t: Touch) => 1_000_000 + t.identifier; // apart from pointer ids
    const onStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        gestureRef.current.gestureCancel(null); // a pinch
        return;
      }
      const t = e.changedTouches[0];
      if (t) gestureRef.current.gestureStart(touchId(t), t.clientX, t.clientY);
    };
    const onMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (gestureRef.current.gestureMove(touchId(t), t.clientX, t.clientY) && e.cancelable) e.preventDefault();
      }
    };
    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) gestureRef.current.gestureEnd(touchId(t), t.clientX);
    };
    const onCancel = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) gestureRef.current.gestureCancel(touchId(t));
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [ready]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      turn(e.key === "ArrowRight" ? 1 : -1, 1, "tap");
    }
  }

  const canForward = flipped < n;
  const canBack = flipped > 0;

  // ---- what each page face is doing this frame ----
  const faces: Record<string, CSSProperties> = {};
  const shades: Record<string, CSSProperties> = {};
  let cast: { slot: "left" | "right"; style: CSSProperties } | null = null;
  const put = (key: string, slot: "left" | "right", z: number, extra?: CSSProperties) => {
    faces[key] = { left: slot === "left" ? 0 : W, top: 0, width: W, height: H, zIndex: z, ...extra };
  };

  if (motion.kind === "rest") {
    if (flipped > 0) put(`${flipped - 1}b`, "left", 2);
    if (flipped < n) put(`${flipped}f`, "right", 2);
  } else if (motion.kind === "soft") {
    const k = motion.leaf;
    const slot = motion.dir === 1 ? "right" : "left";
    const flatKey = motion.dir === 1 ? `${k}f` : `${k}b`;
    const flapKey = motion.dir === 1 ? `${k}b` : `${k}f`;
    if (motion.dir === 1) {
      if (k > 0) put(`${k - 1}b`, "left", 2);
      if (k + 1 < n) put(`${k + 1}f`, "right", 1);
    } else {
      if (k + 1 < n) put(`${k + 1}f`, "right", 2);
      if (k > 0) put(`${k - 1}b`, "left", 1);
    }
    const g = softGeometry(motion, W, H);
    if (!g) put(flatKey, slot, 4);
    else {
      if (g.keptClip) put(flatKey, slot, 4, { clipPath: g.keptClip });
      if (g.flap) {
        put(flapKey, slot, 6, { transformOrigin: "0 0", transform: g.flap.transform, clipPath: g.flap.clipPath });
        shades[flapKey] = g.flap.shade;
      }
      cast = { slot, style: g.cast };
    }
  } else {
    const k = motion.leaf;
    if (k > 0) put(`${k - 1}b`, "left", 2);
    if (k + 1 < n) put(`${k + 1}f`, "right", 2);
    const deg = 180 * motion.p;
    const lift = Math.sin((deg * Math.PI) / 180);
    const reach = Math.round(15 + 70 * Math.abs(Math.cos((deg * Math.PI) / 180)));
    if (deg < 90) {
      put(`${k}f`, "right", 6, { transformOrigin: "0 50%", transform: `rotateY(${-deg}deg)` });
      shades[`${k}f`] = { inset: 0, opacity: lift, background: "linear-gradient(90deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.45) 100%)" };
      if (k + 1 < n)
        cast = { slot: "right", style: { inset: 0, background: `linear-gradient(90deg, rgba(0,0,0,${0.35 * lift}) 0%, rgba(0,0,0,0) ${reach}%)` } };
    } else {
      put(`${k}b`, "left", 6, { transformOrigin: "100% 50%", transform: `rotateY(${180 - deg}deg)` });
      shades[`${k}b`] = { inset: 0, opacity: lift, background: "linear-gradient(-90deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.45) 100%)" };
      if (k > 0)
        cast = { slot: "left", style: { inset: 0, background: `linear-gradient(-90deg, rgba(0,0,0,${0.35 * lift}) 0%, rgba(0,0,0,0) ${reach}%)` } };
    }
  }

  const arrowStyle: CSSProperties = { width: ARROW, height: ARROW, background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" };
  const arrowTop = L.narrow ? H + 14 : H / 2 - ARROW / 2;
  const backLeft = L.narrow ? avail / 2 - ARROW - 10 : L.visLeft - L.gap - ARROW;
  const forwardLeft = L.narrow ? avail / 2 + 10 : L.visRight + L.gap;

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none"
      // The book box is two pages wide even while closed, its empty half
      // hanging past the edge — clipped sideways so it never adds a scrollbar.
      style={avail ? { height: H + (L.narrow ? ARROW + 24 : 16), overflowX: "clip" } : undefined}
      onKeyDown={onKeyDown}
    >
      {avail === 0 ? (
        // Before the width is known (server render, first paint): the closed cover.
        <div className="relative mx-auto rounded-[10px] overflow-hidden" style={{ width: `min(78vw, ${MAX_PAGE}px)`, aspectRatio: "668 / 854" }}>
          {leaves[0]?.front && (
            // eslint-disable-next-line @next/next/no-img-element
            <img {...pageImage(leaves[0].front, `min(78vw, ${MAX_PAGE}px)`)} alt={`${alt} — bìa`} draggable={false} className="absolute inset-0 w-full h-full object-cover" />
          )}
        </div>
      ) : (
        <>
          <div
            ref={bookRef}
            role="group"
            aria-roledescription="sách"
            aria-label={alt}
            className="absolute"
            style={{
              left: L.spine - W,
              top: 0,
              width: 2 * W,
              height: H,
              perspective: `${Math.round(W * 4)}px`,
              perspectiveOrigin: `${W}px 50%`,
              touchAction: "pan-y",
              WebkitTouchCallout: "none",
              WebkitUserSelect: "none",
              cursor: dragging ? "grabbing" : "grab",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse" && !dragRef.current) peelTo(null);
            }}
          >
            {flipped > 0 && (
              <div className="absolute" style={{ left: 0, top: 0, width: W, height: H }} aria-hidden>
                <PageStack progress={flipped / n} side="left" />
              </div>
            )}
            {flipped < n && (
              <div className="absolute" style={{ left: W, top: 0, width: W, height: H }} aria-hidden>
                <PageStack progress={(n - flipped) / n} side="right" />
              </div>
            )}

            {/* Every face stays mounted (hidden when not in view) so an image
                never reloads as it moves from turning page to lying still. */}
            {leaves.map((leaf, j) =>
              (["f", "b"] as const).map((side) => {
                const key = `${j}${side}`;
                const style = faces[key];
                const label = side === "f" ? (j === 0 ? "bìa" : `trang ${2 * j}`) : j === n - 1 ? "bìa sau" : `trang ${2 * j + 1}`;
                return (
                  <div key={key} className="absolute pointer-events-none" style={style ?? { display: "none" }}>
                    <PageSurface
                      src={j > loadedThrough ? null : side === "f" ? leaf.front : leaf.back}
                      alt={`${alt} — ${label}`}
                      width={W}
                      spineSide={side === "f" ? "left" : "right"}
                      isCover={isHard(j)}
                    >
                      {shades[key] && <div className="absolute pointer-events-none" style={shades[key]} aria-hidden />}
                    </PageSurface>
                  </div>
                );
              }),
            )}

            {cast && (
              <div
                className="absolute overflow-hidden rounded-[10px] pointer-events-none"
                style={{ left: cast.slot === "left" ? 0 : W, top: 0, width: W, height: H, zIndex: 3 }}
                aria-hidden
              >
                <div className="absolute" style={cast.style} />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => turn(-1, 1, "tap")}
            disabled={!canBack}
            aria-label="Trang trước"
            className="absolute flex items-center justify-center rounded-full transition-opacity disabled:opacity-30"
            style={{ ...arrowStyle, left: backLeft, top: arrowTop }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => turn(1, 1, "tap")}
            disabled={!canForward}
            aria-label="Trang tiếp theo"
            className="absolute flex items-center justify-center rounded-full transition-opacity disabled:opacity-30"
            style={{ ...arrowStyle, left: forwardLeft, top: arrowTop }}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
