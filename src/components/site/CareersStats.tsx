import { dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

// Reuses the same real figures already shown on Giới thiệu/Dự án — never
// invent separate numbers for this page, they'd drift out of sync.
export function CareersStats({ locale }: { locale: Locale }) {
  const stats = dictionary[locale].about.stats;

  return (
    <section style={{ background: "var(--color-panel)", borderTop: "1px solid var(--color-neutral-200)" }}>
      <div className="site-container py-12 grid grid-cols-2 sm:grid-cols-4 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center text-center gap-1">
            <span className="text-2xl" aria-hidden>
              {s.icon}
            </span>
            <span className="text-2xl font-bold" style={{ color: "var(--color-accent-600)" }}>
              {s.value}
            </span>
            <span className="text-xs font-semibold" style={{ color: "var(--color-neutral-600)" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
