"use client";

import { useDict } from "@/components/site/LocaleProvider";

export function VideoTeaser() {
  const { t } = useDict();

  return (
    <section className="max-w-[900px] mx-auto px-5 py-14 flex flex-col items-center text-center gap-3">
      <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
        {t.videoTeaser.kicker}
      </div>
      <h2 className="text-2xl sm:text-3xl">{t.videoTeaser.title}</h2>
      <div
        className="relative w-full mt-4 rounded-[var(--radius-lg)] overflow-hidden flex items-center justify-center"
        style={{ aspectRatio: "16/9", background: "linear-gradient(135deg, var(--color-neutral-800), var(--color-neutral-900))" }}
      >
        <button
          type="button"
          aria-label={t.videoTeaser.play}
          className="flex items-center justify-center rounded-full transition-transform hover:scale-105"
          style={{ width: 72, height: 72, background: "var(--color-accent-500)" }}
        >
          <span className="text-white text-2xl" aria-hidden style={{ marginLeft: 4 }}>
            ▶
          </span>
        </button>
        <span
          className="absolute bottom-4 right-5 text-xs font-semibold"
          style={{ color: "rgba(255,255,255,.6)" }}
        >
          {t.videoTeaser.comingSoon}
        </span>
      </div>
    </section>
  );
}
