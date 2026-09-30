"use client";

import Image from "next/image";
import Link from "next/link";
import { Sparkle, Tape } from "@/components/site/Doodles";
import { resizedUrl } from "@/lib/imageTransform";
import { PROCESS_ART, SERVICES_ART, type PageArt } from "@/lib/pageArt";

// A picture pinned up at an angle, at its own proportions, opening its project.
function Print({
  art,
  width,
  rotate,
  label,
  labelRight = false,
  tape = true,
  className = "",
  style,
}: {
  art: PageArt;
  width: string;
  rotate: number;
  label?: string;
  labelRight?: boolean;
  tape?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Link
      href={`/du-an?p=${art.projectId}`}
      title={art.title}
      className={`fk-print absolute block ${className}`}
      style={{ width, ["--r" as string]: `${rotate}deg`, ...style }}
    >
      <span className="block relative overflow-hidden rounded-[6px]" style={{ aspectRatio: `${art.w} / ${art.h}`, background: "var(--color-neutral-100)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resizedUrl(art.src, 720)} alt={art.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      </span>
      {tape && <Tape style={{ top: -10, left: "50%", marginLeft: -37, transform: `rotate(${rotate > 0 ? -4 : 3}deg)` }} />}
      {label && (
        <span
          className={`absolute ${labelRight ? "right-3" : "left-3"} bottom-3 rounded-full px-2.5 py-1 text-[11.5px] font-bold`}
          style={{ background: "var(--color-panel)", color: "var(--color-text)", boxShadow: "var(--shadow-sm)" }}
        >
          {label}
        </span>
      )}
    </Link>
  );
}

// Dịch vụ: a page spread, a cover and a character — the three things most
// clients come for — pinned up together.
export function ServicesCollage({ labels }: { labels: readonly string[] }) {
  const { spread, cover, character } = SERVICES_ART;
  return (
    <div className="relative w-full max-w-[560px] mx-auto" style={{ aspectRatio: "1 / 0.86" }}>
      <div
        className="absolute rounded-full"
        style={{ width: "70%", aspectRatio: "1", left: "18%", top: "6%", background: "var(--color-accent-2-100)" }}
        aria-hidden
      />
      <Sparkle size={20} className="absolute" style={{ left: "2%", top: "4%" }} />
      <Sparkle size={13} color="var(--color-accent-2-500)" className="absolute" style={{ right: "3%", top: "58%" }} />
      <Print art={spread} width="70%" rotate={2.5} label={labels[0]} labelRight style={{ right: "1%", top: "5%", zIndex: 1 }} />
      <Print art={cover} width="40%" rotate={-4} label={labels[1]} style={{ left: "3%", top: "30%", zIndex: 2 }} />
      <Link
        href={`/du-an?p=${character.projectId}`}
        title={character.title}
        className="absolute block"
        style={{ width: "27%", right: "8%", bottom: "0%", zIndex: 3 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resizedUrl(character.src, 360)}
          alt={character.title}
          className="fk-bob block w-full"
          style={{ filter: "drop-shadow(0 10px 12px rgba(40,28,16,.22))" }}
          draggable={false}
        />
        <span
          className="absolute left-1/2 -translate-x-1/2 -bottom-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold"
          style={{ background: "var(--color-panel)", color: "var(--color-text)", boxShadow: "var(--shadow-sm)" }}
        >
          {labels[2]}
        </span>
      </Link>
    </div>
  );
}

// A portrait iPad with Procreate open (sếp Phúc's own screenshot of an
// empty canvas) and the artwork on the canvas — how the studio actually
// draws. The picture sits where Procreate centres a canvas: below the top
// toolbar, clear of the brush-size sliders on the left.
export function ProcreateIpad({ art, alt, className = "" }: { art: PageArt; alt: string; className?: string }) {
  return (
    <figure
      className={`relative mx-auto w-full max-w-[400px] ${className}`}
      style={{
        padding: "3.6%",
        borderRadius: "7% / 5%",
        background: "linear-gradient(145deg, #3a3a3d, #151517 55%, #2a2a2d)",
        boxShadow: "0 30px 50px -24px rgba(20,14,8,.55), 0 0 0 1px rgba(255,255,255,.06) inset, 0 2px 0 rgba(255,255,255,.08) inset",
      }}
    >
      {/* front camera */}
      <span className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: "1.5%", width: "1.6%", aspectRatio: "1", background: "#0b0b0c", boxShadow: "0 0 0 1px #2c2c30" }} aria-hidden />
      <span className="relative block overflow-hidden" style={{ aspectRatio: "1668 / 2420", borderRadius: "3.2% / 2.2%", background: "#232323" }}>
        <Image src="/art/procreate-canvas.png" alt="" fill sizes="(max-width: 640px) 90vw, 400px" className="object-cover" />
        <span className="absolute flex items-center justify-center" style={{ left: "13%", right: "7%", top: "7%", bottom: "4%" }}>
          <span className="relative block w-full" style={{ aspectRatio: `${art.w} / ${art.h}`, maxHeight: "100%", boxShadow: "0 6px 18px rgba(0,0,0,.45)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resizedUrl(art.src, 720)} alt={alt} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          </span>
        </span>
      </span>
    </figure>
  );
}

// Quy trình: the same cover as a pencil sketch, in colour, and printed —
// one book from start to finish, left to right.
export function StageStrip({ stages }: { stages: readonly string[] }) {
  const frames = [
    { art: PROCESS_ART.sketch, width: 31, rotate: -4 },
    { art: PROCESS_ART.color, width: 34, rotate: 1.5 },
    { art: PROCESS_ART.printed, width: 44, rotate: 3.5 },
  ];
  return (
    <div className="relative w-full max-w-[600px] mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-center">
        {frames.map((f, i) => (
          <Link
            key={i}
            href={`/du-an?p=${f.art.projectId}`}
            title={f.art.title}
            className="fk-print relative block"
            style={{ width: `${f.width}%`, marginLeft: i ? "-3%" : 0, zIndex: i === 1 ? 2 : 1, ["--r" as string]: `${f.rotate}deg` }}
          >
            <span className="block relative overflow-hidden rounded-[6px]" style={{ aspectRatio: `${f.art.w} / ${f.art.h}`, background: "var(--color-neutral-100)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resizedUrl(f.art.src, 600)} alt={`${f.art.title} — ${stages[i]}`} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
            </span>
          </Link>
        ))}
      </div>
      {/* The labels on one line, each under its picture. */}
      <div className="flex justify-center">
        {frames.map((f, i) => (
          <span
            key={i}
            className="flex items-center justify-center gap-1.5 text-[12.5px] sm:text-[13.5px] font-bold whitespace-nowrap"
            style={{ width: `${f.width}%`, marginLeft: i ? "-3%" : 0, color: "var(--color-neutral-700)" }}
          >
            <span className="inline-flex items-center justify-center rounded-full text-[11px]" style={{ width: 20, height: 20, background: "var(--color-accent-500)", color: "#fff" }}>
              {i + 1}
            </span>
            {stages[i]}
          </span>
        ))}
      </div>
    </div>
  );
}
