import type { Metadata } from "next";
import { LineArtTool } from "@/components/workspace/LineArtTool";

export const metadata: Metadata = { title: "Đi line tự động" };

export default function LineArtPage() {
  return <LineArtTool />;
}
