"use client";

import { useDict } from "./LocaleProvider";

export type LegalSection = { heading: string; body: string[] };
export type LegalCopy = { title: string; updated: string; intro: string; sections: LegalSection[] };

export function LegalDocument({ vi, en }: { vi: LegalCopy; en: LegalCopy }) {
  const { locale } = useDict();
  const c = locale === "en" ? en : vi;
  return (
    <section className="site-container py-14 sm:py-20">
      <article className="mx-auto flex flex-col gap-6" style={{ maxWidth: 760 }}>
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ textWrap: "balance" }}>
            {c.title}
          </h1>
          <span className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            {c.updated}
          </span>
          <p className="mt-2" style={{ lineHeight: 1.7 }}>
            {c.intro}
          </p>
        </header>
        {c.sections.map((s) => (
          <div key={s.heading} className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} style={{ lineHeight: 1.7 }}>
                {p}
              </p>
            ))}
          </div>
        ))}
      </article>
    </section>
  );
}
