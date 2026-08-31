"use client";

import { useState } from "react";
import Link from "next/link";
import { AboutHeroVideo } from "@/components/site/AboutHeroVideo";
import { InlineField } from "@/components/site/InlineField";
import { saveJsonSetting } from "@/lib/actions/admin";

export type AboutHeroText = { headline: string; roleLine: string; body: string };

const TEXT_KEY = "gioi-thieu-hero-text";

export function AboutHero({
  kicker,
  text,
  stats,
  videoSrc,
  canEdit,
}: {
  kicker: string;
  text: AboutHeroText;
  stats: { icon: string; value: string; label: string }[];
  videoSrc: string | null;
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState(text);

  function patch(field: keyof AboutHeroText, value: string) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    saveJsonSetting(TEXT_KEY, next, ["/gioi-thieu"]).catch(() => {});
  }

  return (
    <section className="site-container pt-12 pb-14">
      <div className="flex flex-col items-center text-center xl:flex-row xl:items-start xl:text-left gap-12">
        <div className="flex-1 flex flex-col items-center text-center xl:items-start xl:text-left gap-4 max-w-[560px]">
          <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
            {kicker}
          </div>

          <h1 className="text-[32px] leading-[1.2] lg:text-[40px] font-heading font-bold" style={{ color: "var(--color-text)" }}>
            <InlineField value={draft.headline} placeholder="Tiêu đề" canEdit={canEdit} onSave={(v) => patch("headline", v)} className="w-full" />
          </h1>

          <InlineField
            value={draft.roleLine}
            placeholder="Vai trò / chức danh"
            canEdit={canEdit}
            onSave={(v) => patch("roleLine", v)}
            className="text-sm font-bold"
            style={{ color: "var(--color-accent-700)" }}
          />

          <InlineField
            value={draft.body}
            placeholder="Giới thiệu ngắn"
            canEdit={canEdit}
            onSave={(v) => patch("body", v)}
            multiline
            rows={6}
            className="text-base leading-relaxed"
            style={{ color: "var(--color-neutral-700)", whiteSpace: "pre-line" }}
          />

          <div className="flex flex-wrap justify-center xl:justify-start gap-3 mt-2">
            <Link href="/lien-he" className="btn btn-primary">
              Bắt đầu dự án của bạn →
            </Link>
            <Link href="/du-an" className="btn btn-ghost">
              Xem dự án của chúng tôi
            </Link>
          </div>
        </div>

        <div className="flex-1 w-full max-w-[560px]">
          <AboutHeroVideo src={videoSrc} canEdit={canEdit} />
        </div>
      </div>

      <div
        className="flex flex-wrap justify-center xl:justify-start gap-x-10 gap-y-3 mt-10 pt-6"
        style={{ borderTop: "1px solid var(--color-neutral-200)" }}
      >
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm" style={{ color: "var(--color-neutral-700)" }}>
            <span aria-hidden>{s.icon}</span>
            <span>
              <b style={{ color: "var(--color-text)" }}>{s.value}</b> {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
