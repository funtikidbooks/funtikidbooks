import type { Metadata } from "next";
import { DEFAULT_PRICING_TABLE, PRICING_SETTING_KEY } from "@/lib/pricing";
import { getJsonSetting, getReviews } from "@/lib/data/site-content";
import type { ImageTransform } from "@/components/site/EditableImage";
import { ServicesPageContent } from "./ServicesPageContent";

const PAGE_DESCRIPTION =
  "Dịch vụ minh hoạ sách thiếu nhi, thiết kế nhân vật, dàn trang và thiết kế bìa sách — chuẩn khổ KDP/Amazon, sẵn sàng in ấn. Xem bảng giá và đặt lịch tư vấn dự án.";

export const metadata: Metadata = {
  title: "Dịch vụ",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Dịch vụ · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Dịch vụ · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

export default async function ServicesPage() {
  const [pricing, reviews, serviceImages, serviceTransforms] = await Promise.all([
    getJsonSetting(PRICING_SETTING_KEY, DEFAULT_PRICING_TABLE),
    getReviews(false),
    // The same pictures as the home page's service cards — change one, both follow.
    getJsonSetting<Record<number, string>>("trang-chu-services-images", {}),
    getJsonSetting<Record<number, ImageTransform>>("trang-chu-services-transform", {}),
  ]);

  return (
    <ServicesPageContent
      pricing={pricing}
      initialReviews={reviews}
      serviceImages={serviceImages}
      serviceTransforms={serviceTransforms}
    />
  );
}
