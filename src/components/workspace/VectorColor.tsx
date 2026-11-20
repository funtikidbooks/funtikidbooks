"use client";

import { useState } from "react";
import { normalizeHex } from "@/lib/vector/color";

// Colours of the lines in the file. The hexes are the screen colours Illustrator
// shows for the printing inks (M 100 is the die-line pink of the sticker tool).
const SWATCHES: { hex: string; name: string; hint?: string }[] = [
  { hex: "#000000", name: "Đen", hint: "Mực đen K 100%" },
  { hex: "#EC008C", name: "Hồng khuôn cắt", hint: "Hồng của đường khuôn cắt trong tool Tạo viền sticker (magenta 100%)" },
  { hex: "#ED1C24", name: "Đỏ" },
  { hex: "#00A651", name: "Xanh lá" },
  { hex: "#00AEEF", name: "Xanh lơ" },
  { hex: "#2E3192", name: "Xanh dương" },
  { hex: "#FFFFFF", name: "Trắng", hint: "Viền trắng — xem trước hiện trên nền xám" },
];

function Dot({ color, size }: { color: string; size: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full align-middle"
      style={{ width: size, height: size, background: color, border: "1.5px solid var(--color-neutral-300)" }}
    />
  );
}

type Props = {
  auto: boolean; // the file takes the colour of the lines in the picture
  color: string; // the colour the file will have
  detected: string; // the colour of the lines in the picture
  hasImage: boolean;
  onAuto: (on: boolean) => void;
  onPick: (hex: string) => void;
};

export function VectorColor({ auto, color, detected, hasImage, onAuto, onPick }: Props) {
  // What is being typed in the hex box; null while it is not being edited.
  const [draft, setDraft] = useState<string | null>(null);
  const lower = color.toLowerCase();
  const custom = !auto && !SWATCHES.some((s) => s.hex.toLowerCase() === lower);

  function commit() {
    const hex = normalizeHex(draft ?? "");
    if (hex) onPick(hex);
    setDraft(null);
  }

  return (
    <div className="card elev-sm p-4 flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-bold">Màu viền</span>
        <span className="flex items-center gap-2 text-[14px] font-semibold tabular-nums" style={{ color: "var(--color-neutral-600)" }}>
          <Dot color={color} size={20} />
          {color.toUpperCase()}
        </span>
      </div>

      <label className="flex items-start gap-2.5 text-[15px]">
        <input type="checkbox" className="mt-1" style={{ width: 20, height: 20, flexShrink: 0 }} checked={auto} onChange={(e) => onAuto(e.target.checked)} />
        <span>
          <span className="font-semibold">Theo màu trong ảnh</span>
          <span className="block text-[14px]" style={{ color: "var(--color-neutral-600)" }}>
            {!hasImage ? (
              "Chọn file xong web tự nhận màu nét. Muốn màu khác thì bấm 1 ô màu bên dưới."
            ) : auto ? (
              <>
                Đang lấy màu của nét trong ảnh <Dot color={detected} size={14} /> {detected.toUpperCase()}. Bỏ tick hoặc bấm 1 ô màu bên dưới để tự chọn.
              </>
            ) : (
              <>
                Đang dùng màu tự chọn. Tick lại để lấy màu như trong ảnh <Dot color={detected} size={14} /> {detected.toUpperCase()}.
              </>
            )}
          </span>
        </span>
      </label>

      <div role="group" aria-label="Chọn màu viền" className="flex flex-wrap gap-2">
        {SWATCHES.map((s) => {
          const on = !auto && lower === s.hex.toLowerCase();
          return (
            <button
              key={s.hex}
              type="button"
              aria-pressed={on}
              title={s.hint}
              onClick={() => onPick(s.hex)}
              className="flex items-center gap-1.5 rounded-full pl-2 pr-3 text-[14px] font-semibold"
              style={{
                minHeight: 40,
                background: on ? "var(--color-accent-100)" : "var(--color-surface)",
                color: on ? "var(--color-accent-800)" : "var(--color-text)",
                border: `2px solid ${on ? "var(--color-accent-700)" : "var(--color-neutral-200)"}`,
              }}
            >
              <Dot color={s.hex} size={20} />
              {s.name}
              {on && <span aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>

      <div
        className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2"
        style={{
          background: custom ? "var(--color-accent-100)" : "var(--color-surface)",
          border: `2px solid ${custom ? "var(--color-accent-700)" : "var(--color-neutral-200)"}`,
        }}
      >
        <span className="text-[14px] font-semibold" style={{ color: custom ? "var(--color-accent-800)" : "var(--color-text)" }}>
          Màu khác {custom && "✓"}
        </span>
        <input
          type="color"
          aria-label="Chọn màu khác"
          value={lower}
          onChange={(e) => onPick(e.target.value.toUpperCase())}
          style={{ width: 52, height: 40, padding: 2, flexShrink: 0 }}
        />
        <input
          type="text"
          aria-label="Mã màu, ví dụ #EC008C"
          className="input tabular-nums"
          style={{ width: 116, fontSize: 16, padding: "6px 10px", minHeight: 40 }}
          maxLength={7}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={draft ?? color.toUpperCase()}
          onChange={(e) => {
            setDraft(e.target.value);
            const full = /^#?[0-9a-f]{6}$/i.test(e.target.value.trim()) ? normalizeHex(e.target.value) : null;
            if (full) onPick(full);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
      </div>

      <p className="text-[14px]" style={{ color: "var(--color-neutral-600)" }}>
        Màu đen xuất ra mực đen K 100% (không pha 4 màu). Hồng khuôn cắt đặt tên nhóm CutContour trong SVG, giống file khuôn của tool Tạo viền sticker.
      </p>
    </div>
  );
}
