"use client";

import { useState } from "react";

type FaqEntry = { q: string; a: string };

function FaqItem({ item }: { item: FaqEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 py-4 text-left"
      >
        <span className="text-base font-bold" style={{ color: "var(--color-accent-700)" }}>
          {item.q}
        </span>
        <span
          aria-hidden
          className="flex-none text-2xl font-bold leading-none"
          style={{ color: "var(--color-accent-700)", transform: open ? "rotate(45deg)" : "none", transition: "transform 0.2s ease" }}
        >
          +
        </span>
      </button>
      {open && (
        <p className="pb-4 pr-8 text-sm" style={{ color: "var(--color-neutral-700)" }}>
          {item.a}
        </p>
      )}
    </div>
  );
}

export function FaqSection({ title, items }: { title: string; items: FaqEntry[] }) {
  const mid = Math.ceil(items.length / 2);
  const columns = [items.slice(0, mid), items.slice(mid)];

  return (
    <section className="max-w-[1280px] mx-auto px-5 py-14">
      <h2 className="text-3xl text-center mb-10">{title}</h2>
      <div className="grid gap-x-12 md:grid-cols-2">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col">
            {col.map((item) => (
              <FaqItem key={item.q} item={item} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
