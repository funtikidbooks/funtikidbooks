import type { Metadata } from "next";
import { VectorTool } from "@/components/workspace/VectorTool";

export const metadata: Metadata = { title: "Chuyển line sang vector" };

export default function VectorPage() {
  return <VectorTool />;
}
