"use client";

import { useState } from "react";
import { FontLibrary } from "@/components/workspace/FontLibrary";
import { BrushLibrary } from "@/components/workspace/BrushLibrary";
import type { BrushAsset, FontAsset } from "@/lib/types";

export function FontBrushLibrary({
  initialFonts,
  initialBrushes,
  currentUserId,
  isDirector,
}: {
  initialFonts: FontAsset[];
  initialBrushes: BrushAsset[];
  currentUserId: string;
  isDirector: boolean;
}) {
  const [tab, setTab] = useState<"font" | "brush">("font");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-6 pt-4 pb-3">
        <h1 className="text-xl mr-2">Kho font & brush</h1>
        <button
          type="button"
          onClick={() => setTab("font")}
          className={`btn btn-sm ${tab === "font" ? "btn-primary" : "btn-ghost"}`}
        >
          🔤 Font
        </button>
        <button
          type="button"
          onClick={() => setTab("brush")}
          className={`btn btn-sm ${tab === "brush" ? "btn-primary" : "btn-ghost"}`}
        >
          🖌️ Brush
        </button>
      </div>

      {tab === "font" ? (
        <FontLibrary initialFonts={initialFonts} currentUserId={currentUserId} isDirector={isDirector} />
      ) : (
        <BrushLibrary initialBrushes={initialBrushes} currentUserId={currentUserId} isDirector={isDirector} />
      )}
    </div>
  );
}
