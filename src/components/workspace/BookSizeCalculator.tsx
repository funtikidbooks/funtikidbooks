"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionHeading } from "@/components/admin/SectionHeading";
import {
  BLEED_IN,
  Binding,
  CoverBreakdown,
  Dim,
  INTERIOR_TYPES,
  InteriorType,
  OUTER_MARGIN_IN,
  PAPER_TYPES,
  PaperType,
  ReadingDirection,
  TRIM_SIZES,
  coverSizes,
  formatCm,
  formatIn,
  formatPx,
  gutterMarginIn,
  interiorSizes,
  paperTypesFor,
} from "@/lib/bookSize";
import { coverTemplateSvg, downloadPng, downloadSvg, interiorTemplateSvg } from "@/lib/bookSizeSvg";

const DEFAULT_TRIM_INDEX = TRIM_SIZES.findIndex((t) => t.width === 8.5 && t.height === 8.5);
const DEFAULT_PAGE_COUNT = 32;
const DEFAULT_INTERIOR_TYPE: InteriorType = "premiumColor";
const DEFAULT_PAPER_TYPE: PaperType = "white";

function DimensionRow({ label, inch }: { label: string; inch: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5" style={{ borderBottom: "1px solid var(--color-neutral-100)" }}>
      <span className="text-xs font-semibold" style={{ color: "var(--color-neutral-600)" }}>
        {label}
      </span>
      <span className="text-xs font-mono text-right">
        {formatIn(inch)} · {formatCm(inch)} · {formatPx(inch)}
      </span>
    </div>
  );
}

const COVER_ROWS: { no: number; label: string; pick: (c: CoverBreakdown) => Dim }[] = [
  { no: 1, label: "Bìa gộp (Full Cover)", pick: (c) => c.fullCover },
  { no: 2, label: "Bìa trước / bìa sau (Front Cover)", pick: (c) => c.frontCover },
  { no: 3, label: "Vùng an toàn (Safe Area)", pick: (c) => c.safeArea },
  { no: 4, label: "Tràn lề (Bleed)", pick: (c) => c.bleed },
  { no: 5, label: "Lề bìa (Margin)", pick: (c) => c.margin },
  { no: 6, label: "Gáy (Spine)", pick: (c) => c.spine },
  { no: 7, label: "Vùng chữ an toàn gáy (Spine Safe Area)", pick: (c) => c.spineSafeArea },
  { no: 8, label: "Lề gáy (Spine Margin)", pick: (c) => c.spineMargin },
  { no: 9, label: "Lề mã vạch (Barcode Margin)", pick: (c) => c.barcodeMargin },
];

export function BookSizeCalculator() {
  const [binding, setBinding] = useState<Binding>("paperback");
  const [trimIndex, setTrimIndex] = useState<number | "custom">(DEFAULT_TRIM_INDEX);
  const [customW, setCustomW] = useState(8.5);
  const [customH, setCustomH] = useState(8.5);
  const [pageCount, setPageCount] = useState(DEFAULT_PAGE_COUNT);
  const [interiorType, setInteriorType] = useState<InteriorType>(DEFAULT_INTERIOR_TYPE);
  const [paperType, setPaperType] = useState<PaperType>(DEFAULT_PAPER_TYPE);
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>("ltr");
  const [bleed, setBleed] = useState(true);

  const availablePaperTypes = useMemo(() => paperTypesFor(interiorType), [interiorType]);
  useEffect(() => {
    if (!availablePaperTypes.includes(paperType)) setPaperType(availablePaperTypes[0]);
  }, [availablePaperTypes, paperType]);

  const availableTrims = useMemo(
    () => (binding === "hardcover" ? TRIM_SIZES.filter((t) => t.hardcover) : TRIM_SIZES),
    [binding],
  );

  const trim = useMemo(() => {
    if (trimIndex === "custom") return { width: customW || 0.1, height: customH || 0.1 };
    return availableTrims[trimIndex] ?? availableTrims[0] ?? TRIM_SIZES[0];
  }, [trimIndex, customW, customH, availableTrims]);

  const interior = useMemo(() => interiorSizes(trim, bleed), [trim, bleed]);
  const cover = useMemo(
    () => coverSizes(trim, pageCount, interiorType, paperType),
    [trim, pageCount, interiorType, paperType],
  );
  const gutter = gutterMarginIn(pageCount);
  const spineTooThinForText = cover.spine.w < 0.0625;

  function pickTrim(value: string) {
    if (value === "custom") {
      setTrimIndex("custom");
      return;
    }
    const idx = availableTrims.findIndex((t) => t.label === value);
    setTrimIndex(idx);
  }

  const trimSelectValue = trimIndex === "custom" ? "custom" : availableTrims[trimIndex]?.label ?? "custom";

  function resetAll() {
    setBinding("paperback");
    setTrimIndex(DEFAULT_TRIM_INDEX);
    setCustomW(8.5);
    setCustomH(8.5);
    setPageCount(DEFAULT_PAGE_COUNT);
    setInteriorType(DEFAULT_INTERIOR_TYPE);
    setPaperType(DEFAULT_PAPER_TYPE);
    setReadingDirection("ltr");
    setBleed(true);
  }

  function downloadInteriorSvg() {
    downloadSvg(interiorTemplateSvg(trim, pageCount, bleed), `khung-trang-ruot-${trim.width}x${trim.height}.svg`);
  }
  function downloadInteriorPng() {
    downloadPng(interiorTemplateSvg(trim, pageCount, bleed), interior.fileW, interior.fileH, 300, `khung-trang-ruot-${trim.width}x${trim.height}.png`);
  }
  function downloadCoverSvg() {
    downloadSvg(
      coverTemplateSvg(trim, pageCount, interiorType, paperType, readingDirection),
      `khung-bia-gop-${trim.width}x${trim.height}-${pageCount}tr.svg`,
    );
  }
  function downloadCoverPng() {
    downloadPng(
      coverTemplateSvg(trim, pageCount, interiorType, paperType, readingDirection),
      cover.fileW,
      cover.fileH,
      300,
      `khung-bia-gop-${trim.width}x${trim.height}-${pageCount}tr.png`,
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-start justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <div>
          <h1 className="text-xl">Tính khổ sách</h1>
          <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
            Tính khổ trang ruột và bìa gộp (bìa trước + gáy + bìa sau) kiểu Cover Calculator của KDP — dùng để dựng khung vẽ đúng kích thước.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm flex-none" onClick={resetAll}>
          ↺ Đặt lại
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        <div className="card elev-sm p-5 flex flex-col gap-5">
          <SectionHeading step="01" title="Thông số sách" />

          <div className="field">
            <label>Loại bìa</label>
            <div className="flex items-center gap-2">
              {([
                ["paperback", "Bìa mềm"],
                ["hardcover", "Bìa cứng"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setBinding(key);
                    setTrimIndex(0);
                  }}
                  className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    background: binding === key ? "var(--color-accent-700)" : "var(--color-surface)",
                    color: binding === key ? "#fff" : "var(--color-text)",
                    border: `1.5px solid ${binding === key ? "var(--color-accent-700)" : "var(--color-neutral-200)"}`,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {binding === "hardcover" && (
            <p className="text-xs font-semibold p-3 rounded-[var(--radius-sm)]" style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}>
              ⚠️ Bìa cứng: công cụ này ước tính bằng công thức tràn lề/gáy giống bìa mềm, CHƯA cộng viền bọc bìa cứng (~0.75in) và độ dày bìa. Chỉ dùng để ước lượng nhanh — trước khi gửi in, luôn tạo file cuối bằng Cover Calculator chính thức của KDP.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="trim-size">Khổ sách (trim size)</label>
              <select id="trim-size" className="input" value={trimSelectValue} onChange={(e) => pickTrim(e.target.value)}>
                {availableTrims.map((t) => (
                  <option key={t.label} value={t.label}>
                    {t.label}
                  </option>
                ))}
                <option value="custom">Tuỳ chỉnh…</option>
              </select>
            </div>

            {trimIndex === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="field">
                  <label htmlFor="custom-w">Rộng (in)</label>
                  <input
                    id="custom-w"
                    type="number"
                    step={0.01}
                    min={0.1}
                    className="input"
                    value={customW}
                    onChange={(e) => setCustomW(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="custom-h">Cao (in)</label>
                  <input
                    id="custom-h"
                    type="number"
                    step={0.01}
                    min={0.1}
                    className="input"
                    value={customH}
                    onChange={(e) => setCustomH(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="page-count">Số trang</label>
              <input
                id="page-count"
                type="number"
                min={1}
                className="input"
                value={pageCount}
                onChange={(e) => setPageCount(parseInt(e.target.value, 10) || 0)}
              />
            </div>

            <div className="field">
              <label htmlFor="interior-type">Loại nội dung (mực in)</label>
              <select
                id="interior-type"
                className="input"
                value={interiorType}
                onChange={(e) => setInteriorType(e.target.value as InteriorType)}
              >
                {INTERIOR_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="paper-type">Loại giấy nội dung</label>
              <select id="paper-type" className="input" value={paperType} onChange={(e) => setPaperType(e.target.value as PaperType)}>
                {PAPER_TYPES.filter((p) => availablePaperTypes.includes(p.key)).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              {availablePaperTypes.length === 1 && (
                <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                  Nội dung màu chỉ in trên giấy trắng.
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="reading-direction">Hướng đọc</label>
              <select
                id="reading-direction"
                className="input"
                value={readingDirection}
                onChange={(e) => setReadingDirection(e.target.value as ReadingDirection)}
              >
                <option value="ltr">Trái sang phải</option>
                <option value="rtl">Phải sang trái (manga…)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-neutral-700)" }}>
              <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} />
              Trang ruột có tràn lề (hình vẽ chạm mép trang)
            </label>
          </div>

          {pageCount < 24 && (
            <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
              Lưu ý: KDP yêu cầu tối thiểu 24 trang cho bìa mềm (bìa cứng thường tối thiểu 75 trang tuỳ khổ).
            </p>
          )}
        </div>

        <div className="card elev-sm p-5 flex flex-col gap-3">
          <SectionHeading step="02" title="Trang ruột" />
          <DimensionRow label="Khổ xén (trim)" inch={interior.trimW} />
          {bleed && <DimensionRow label="Khổ file cần vẽ (có tràn lề)" inch={interior.fileW} />}
          <DimensionRow label="Lề gáy (trong)" inch={gutter} />
          <DimensionRow label="Lề ngoài/trên/dưới" inch={OUTER_MARGIN_IN} />
          <div className="flex items-center gap-2 mt-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={downloadInteriorSvg}>
              ⬇ Tải khung SVG
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={downloadInteriorPng}>
              ⬇ Tải khung PNG (300dpi)
            </button>
          </div>
        </div>

        <div className="card elev-sm p-5 flex flex-col gap-3">
          <SectionHeading step="03" title="Bìa gộp (bìa trước + gáy + bìa sau)" />

          {spineTooThinForText && (
            <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
              Gáy quá mỏng ({formatIn(cover.spine.w)}) — không nên đặt chữ trên gáy, mép bìa trước/sau gần như chạm nhau khi in.
            </p>
          )}

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--color-neutral-500)" }}>
                  <th className="text-left font-semibold px-1 py-1.5">#</th>
                  <th className="text-left font-semibold px-1 py-1.5">Mô tả</th>
                  <th className="text-right font-semibold px-1 py-1.5">Rộng</th>
                  <th className="text-right font-semibold px-1 py-1.5">Cao</th>
                </tr>
              </thead>
              <tbody>
                {COVER_ROWS.map((row) => {
                  const dim = row.pick(cover);
                  return (
                    <tr key={row.no} style={{ borderTop: "1px solid var(--color-neutral-100)" }}>
                      <td className="px-1 py-1.5" style={{ color: "var(--color-neutral-400)" }}>
                        {row.no}
                      </td>
                      <td className="px-1 py-1.5 font-semibold">{row.label}</td>
                      <td className="px-1 py-1.5 text-right font-mono">
                        {formatIn(dim.w)} · {formatCm(dim.w)}
                      </td>
                      <td className="px-1 py-1.5 text-right font-mono">
                        {formatIn(dim.h)} · {formatCm(dim.h)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
            Khổ file cần vẽ (có tràn lề, 300dpi): {formatIn(cover.fileW)} × {formatIn(cover.fileH)} — {formatPx(cover.fileW)} × {formatPx(cover.fileH)}.
            Mã vạch do Amazon tự chèn khi xuất bản — chỉ cần chừa trống góc đó, không cần tự vẽ mã vạch.
          </p>

          <div className="flex items-center gap-2 mt-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={downloadCoverSvg}>
              ⬇ Tải khung SVG
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={downloadCoverPng}>
              ⬇ Tải khung PNG (300dpi)
            </button>
          </div>
        </div>

        <p className="text-[11px] p-3 rounded-[var(--radius-sm)]" style={{ background: "var(--color-surface)", color: "var(--color-neutral-500)" }}>
          Công thức tham khảo theo tài liệu công khai của KDP (tràn lề {formatIn(BLEED_IN)}, độ dày giấy/trang theo loại giấy, lề bìa/gáy/mã vạch
          đối chiếu từ ví dụ số liệu thật trên KDP). Đây là công cụ ước lượng nội bộ để dựng khung vẽ nhanh — trước khi gửi file in chính thức,
          luôn xác nhận lại kích thước bằng Cover Calculator trên trang KDP.
        </p>
      </div>
    </div>
  );
}
