import type { Metadata } from "next";
import { listReviews } from "@/lib/actions/admin";
import { ReviewsAdmin } from "./ReviewsAdmin";

export const metadata: Metadata = { title: "Quản trị — Đánh giá khách hàng" };

export default async function AdminReviewsPage() {
  const reviews = await listReviews();
  return <ReviewsAdmin initialReviews={reviews} />;
}
