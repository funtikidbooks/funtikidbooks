"use client";

export function LangTabs({ lang, onChange }: { lang: "vi" | "en"; onChange: (lang: "vi" | "en") => void }) {
  return (
    <div className="flex items-center gap-1 mb-1" role="tablist" aria-label="Ngôn ngữ nội dung">
      {(["vi", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          aria-selected={lang === l}
          onClick={() => onChange(l)}
          className="category-chip px-3 py-1.5 rounded-full text-xs font-bold"
          style={{
            background: lang === l ? "var(--color-accent-2-700)" : "var(--color-surface)",
            color: lang === l ? "#fff" : "var(--color-text)",
            border: `1.5px solid ${lang === l ? "var(--color-accent-2-700)" : "var(--color-neutral-200)"}`,
          }}
        >
          {l === "vi" ? "🇻🇳 Tiếng Việt" : "🇬🇧 English (tuỳ chọn)"}
        </button>
      ))}
    </div>
  );
}
