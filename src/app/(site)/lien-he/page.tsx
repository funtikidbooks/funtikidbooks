import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/data/site-content";
import { ContactPageContent } from "./ContactPageContent";

const PAGE_DESCRIPTION =
  "Liên hệ Funti Kidbooks Studio để bắt đầu dự án minh hoạ sách thiếu nhi của bạn — email, số điện thoại, địa chỉ studio tại TP.HCM và biểu mẫu gửi yêu cầu tư vấn.";

export const metadata: Metadata = {
  title: "Liên hệ",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Liên hệ · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Liên hệ · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

const OFFICE_IMAGE_KEY = "lien-he-anh-van-phong";

export default async function ContactPage() {
  const settings = await getSiteSettings([OFFICE_IMAGE_KEY]);
  return <ContactPageContent officeImage={settings[OFFICE_IMAGE_KEY] ?? null} />;
}
