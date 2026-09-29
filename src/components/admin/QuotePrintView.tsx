"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { Quote } from "@/lib/quote";
import { QuoteSheet } from "@/components/QuoteSheet";

// The quote alone on a page, ready for 🖨 In / Lưu PDF — the browser's print
// dialog saves it as a PDF to send the client (Zalo, email). The file name
// the dialog suggests comes from the page title.
export function QuotePrintView({ quote }: { quote: Quote }) {
  useEffect(() => {
    const prev = document.title;
    document.title = `Bao gia ${quote.code}${quote.client_name ? ` - ${quote.client_name}` : ""}`;
    return () => {
      document.title = prev;
    };
  }, [quote.code, quote.client_name]);

  return (
    <div className="flex-1 flex flex-col items-center gap-4 px-3 py-5 sm:py-8" style={{ background: "var(--color-surface)" }}>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 w-full max-w-[820px]">
        <Link href={`/quan-tri/bao-gia/${quote.id}`} className="text-sm font-bold" style={{ color: "var(--color-accent-700)" }}>
          ← Quay lại sửa
        </Link>
        <div className="flex flex-col items-end gap-1">
          <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
            🖨 In / Lưu PDF
          </button>
          <span className="text-[11.5px]" style={{ color: "var(--color-neutral-500)" }}>
            Máy tính: chọn “Lưu dưới dạng PDF” · iPad/iPhone: bấm nút Chia sẻ trong khung in → Lưu vào Tệp
          </span>
        </div>
      </div>
      <div className="w-full max-w-[820px] rounded-[16px] elev-md overflow-hidden fk-quote-paper">
        <QuoteSheet quote={quote} />
      </div>
    </div>
  );
}
