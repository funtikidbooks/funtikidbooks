"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { PricingTable as PricingTableData } from "@/lib/types";
import { useDict } from "@/components/site/LocaleProvider";
import { pickLocalized } from "@/lib/i18n";

const PricingEditDialog = dynamic(
  () => import("@/components/admin/PricingEditDialog").then((m) => m.PricingEditDialog),
  { ssr: false },
);

function formatVnd(n: number | null) {
  if (n === null) return null;
  return `${n.toLocaleString("vi-VN")}₫`;
}

function formatUsd(n: number | null) {
  if (n === null) return null;
  return `$${n.toLocaleString("en-US")}`;
}

export function PricingTable({ table, canEdit }: { table: PricingTableData; canEdit: boolean }) {
  const [data, setData] = useState(table);
  const [editing, setEditing] = useState(false);
  const { locale, t } = useDict();

  return (
    <section className="max-w-[1280px] mx-auto px-5 py-14">
      <div className="flex flex-col items-center text-center gap-2 mb-10">
        <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
          {t.pricing.kicker}
        </div>
        <h2 className="text-3xl">{t.pricing.title}</h2>
        <p className="max-w-[520px]" style={{ color: "var(--color-neutral-700)" }}>
          {t.pricing.subtitle}
        </p>
        {canEdit && (
          <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => setEditing(true)}>
            {t.pricing.editButton}
          </button>
        )}
      </div>

      <div className="overflow-x-auto pt-7">
        <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${data.tiers.length}, minmax(240px, 1fr))` }}>
          {data.tiers.map((tier, tierIndex) => {
            const vnd = formatVnd(tier.priceVnd);
            const usd = formatUsd(tier.priceUsd);
            const tierName = pickLocalized(locale, tier.name, tier.nameEn);
            const tierDescription = pickLocalized(locale, tier.description, tier.descriptionEn);
            const tierDelivery = pickLocalized(locale, tier.delivery, tier.deliveryEn);
            return (
              <div
                key={tier.id}
                className="relative flex flex-col gap-4 p-6"
                style={
                  tier.featured
                    ? {
                        borderRadius: "var(--radius-md)",
                        border: "2px solid var(--color-accent-600)",
                        background: "var(--color-panel)",
                        boxShadow: "var(--shadow-sm)",
                        transform: "translateY(-6px)",
                      }
                    : {
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--color-neutral-200)",
                        background: "var(--color-panel)",
                        boxShadow: "var(--shadow-sm)",
                      }
                }
              >
                {tier.featured && (
                  <span
                    className="absolute left-1/2 flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
                    style={{ top: -14, transform: "translateX(-50%)", background: "var(--color-accent-600)", color: "#fff" }}
                  >
                    {t.pricing.featuredBadge}
                  </span>
                )}
                <div>
                  <h3 className="text-lg font-bold">{tierName}</h3>
                  {tierDescription && (
                    <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
                      {tierDescription}
                    </p>
                  )}
                </div>

                <div>
                  {vnd || usd ? (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {vnd && (
                        <span className="text-2xl font-heading font-bold" style={{ color: "var(--color-accent-700)" }}>
                          {vnd}
                        </span>
                      )}
                      {usd && (
                        <span className="text-sm font-semibold" style={{ color: "var(--color-neutral-500)" }}>
                          (~{usd})
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-lg font-bold" style={{ color: "var(--color-neutral-500)" }}>
                      {t.pricing.contactForQuote}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--color-neutral-600)" }}>
                  <span aria-hidden>🕐</span>
                  {tierDelivery}
                </div>

                <div className="flex flex-col gap-2 flex-1" style={{ borderTop: "1px solid var(--color-neutral-200)", paddingTop: 14 }}>
                  {data.rows.map((row) => {
                    const value = row.values[tierIndex] ?? "-";
                    const rowLabel = pickLocalized(locale, row.label, row.labelEn);
                    return (
                      <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
                        <span style={{ color: "var(--color-neutral-600)" }}>{rowLabel}</span>
                        <span className="font-semibold flex-none" style={{ color: value === "-" ? "var(--color-neutral-300)" : "var(--color-text)" }}>
                          {value}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <Link href="/lien-he" className="btn btn-primary btn-block mt-2">
                  {t.pricing.contactCta}
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <PricingEditDialog
          table={data}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setData(next);
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}
