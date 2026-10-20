import type { Metadata } from "next";
import { StickerBorderTool } from "@/components/workspace/StickerBorderTool";

export const metadata: Metadata = { title: "Tạo viền sticker" };

export default function StickerBorderPage() {
  return <StickerBorderTool />;
}
