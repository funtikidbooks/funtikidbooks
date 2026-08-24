"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { PricingTable as PricingTableData } from "@/lib/types";

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

  return (
    <section className="max-w-[1280px] mx-auto px-5 py-14">
      <div className="flex flex-col items-center text-center gap-2 mb-10">
        <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
          BẢNG GIÁ
        </div>
        <h2 className="text-3xl">Gói dịch vụ minh hoạ</h2>
        <p className="max-w-[520px]" style={{ color: "var(--color-neutral-700)" }}>
          Giá tham khảo — Funti sẽ báo giá cụ thể theo phạm vi dự án thực tế của bạn.
        </p>
        {canEdit && (
          <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => setEditing(true)}>
            ✏️ Chỉnh sửa bảng giá
          </button>
        )}
      </div>

      <div className="overflow-x-auto pt-7">
        <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${data.tiers.length}, minmax(240px, 1fr))` }}>
          {data.tiers.map((tier, tierIndex) => {
            const vnd = formatVnd(tier.priceVnd);
            const usd = formatUsd(tier.priceUsd);
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
                    ⭐ NỔI BẬT
                  </span>
                )}
                <div>
                  <h3 className="text-lg font-bold">{tier.name}</h3>
                  {tier.description && (
                    <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
                      {tier.description}
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
                      Liên hệ báo giá
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--color-neutral-600)" }}>
                  <span aria-hidden>🕐</span>
                  {tier.delivery}
                </div>

                <div className="flex flex-col gap-2 flex-1" style={{ borderTop: "1px solid var(--color-neutral-200)", paddingTop: 14 }}>
                  {data.rows.map((row) => {
                    const value = row.values[tierIndex] ?? "-";
                    return (
                      <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
                        <span style={{ color: "var(--color-neutral-600)" }}>{row.label}</span>
                        <span className="font-semibold flex-none" style={{ color: value === "-" ? "var(--color-neutral-300)" : "var(--color-text)" }}>
                          {value}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <Link href="/lien-he" className="btn btn-primary btn-block mt-2">
                  Liên hệ ngay
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
