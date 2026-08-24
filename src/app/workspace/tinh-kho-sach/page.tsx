import type { Metadata } from "next";
import { BookSizeCalculator } from "@/components/workspace/BookSizeCalculator";

export const metadata: Metadata = { title: "Tính khổ sách" };

export default function BookSizePage() {
  return <BookSizeCalculator />;
}
