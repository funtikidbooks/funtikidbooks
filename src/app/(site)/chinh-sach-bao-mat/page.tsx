import type { Metadata } from "next";
import { LegalDocument, type LegalCopy } from "@/components/site/LegalDocument";

export const metadata: Metadata = {
  title: "Chính sách bảo mật",
  description: "Cách Funti Kidbooks Studio thu thập, sử dụng và bảo vệ thông tin cá nhân của khách hàng.",
};

const CONTACT_VI = "Mọi thắc mắc, vui lòng liên hệ funtikidbooks.studio@gmail.com hoặc 0978 346 851.";
const CONTACT_EN = "For any questions, contact funtikidbooks.studio@gmail.com or +84 978 346 851.";

const vi: LegalCopy = {
  title: "Chính sách bảo mật",
  updated: "Cập nhật lần cuối: 09/2026",
  intro:
    "Funti Kidbooks Studio (Công ty TNHH Funti Kidbooks, MST 0319688648) tôn trọng quyền riêng tư của bạn. Chính sách này giải thích chúng tôi thu thập, sử dụng và bảo vệ thông tin của bạn như thế nào khi bạn truy cập website hoặc hợp tác cùng chúng tôi.",
  sections: [
    {
      heading: "1. Thông tin chúng tôi thu thập",
      body: [
        "Thông tin bạn cung cấp trực tiếp: họ tên, email, số điện thoại, nội dung yêu cầu dự án, tệp đính kèm và nội dung trao đổi qua biểu mẫu liên hệ hoặc cổng khách hàng.",
        "Thông tin kỹ thuật cơ bản: loại trình duyệt, thiết bị và dữ liệu truy cập ẩn danh nhằm giúp website hoạt động ổn định.",
      ],
    },
    {
      heading: "2. Mục đích sử dụng",
      body: [
        "Phản hồi yêu cầu tư vấn, báo giá và triển khai dự án; gửi thông tin liên quan đến dự án đang thực hiện; cải thiện chất lượng website và dịch vụ.",
      ],
    },
    {
      heading: "3. Chia sẻ thông tin",
      body: [
        "Chúng tôi không bán hoặc trao đổi thông tin cá nhân của bạn. Thông tin chỉ được chia sẻ với các nhà cung cấp hạ tầng cần thiết để vận hành dịch vụ (lưu trữ, email) hoặc khi pháp luật yêu cầu.",
      ],
    },
    {
      heading: "4. Lưu trữ và bảo mật",
      body: [
        "Dữ liệu được lưu trên hạ tầng đám mây có kiểm soát truy cập. Chúng tôi áp dụng các biện pháp kỹ thuật hợp lý để bảo vệ dữ liệu, tuy nhiên không có phương thức truyền tải nào trên Internet là an toàn tuyệt đối.",
      ],
    },
    {
      heading: "5. Tệp và tác phẩm của khách hàng",
      body: [
        "Tài liệu, bản thảo và hình ảnh bạn gửi cho chúng tôi chỉ được dùng cho dự án của bạn và không được công bố khi chưa có sự đồng ý của bạn.",
      ],
    },
    {
      heading: "6. Quyền của bạn",
      body: ["Bạn có quyền yêu cầu xem, chỉnh sửa hoặc xoá thông tin cá nhân mà chúng tôi lưu giữ. " + CONTACT_VI],
    },
  ],
};

const en: LegalCopy = {
  title: "Privacy Policy",
  updated: "Last updated: 09/2026",
  intro:
    "Funti Kidbooks Studio (Funti Kidbooks Co., Ltd, Tax code 0319688648) respects your privacy. This policy explains how we collect, use and protect your information when you visit our website or work with us.",
  sections: [
    {
      heading: "1. Information we collect",
      body: [
        "Information you provide directly: name, email, phone number, project details, attachments and messages sent through the contact form or client portal.",
        "Basic technical information: browser type, device and anonymous usage data that helps keep the website running reliably.",
      ],
    },
    {
      heading: "2. How we use it",
      body: [
        "To respond to enquiries and quotes, deliver your project, send project-related updates, and improve our website and services.",
      ],
    },
    {
      heading: "3. Sharing",
      body: [
        "We do not sell or trade your personal information. It is shared only with infrastructure providers needed to run the service (hosting, email) or when required by law.",
      ],
    },
    {
      heading: "4. Storage and security",
      body: [
        "Data is stored on access-controlled cloud infrastructure. We apply reasonable technical safeguards, but no method of transmission over the Internet is completely secure.",
      ],
    },
    {
      heading: "5. Your files and artwork",
      body: [
        "Documents, manuscripts and images you send us are used only for your project and are never published without your consent.",
      ],
    },
    {
      heading: "6. Your rights",
      body: ["You may request access to, correction of, or deletion of the personal data we hold. " + CONTACT_EN],
    },
  ],
};

export default function PrivacyPage() {
  return <LegalDocument vi={vi} en={en} />;
}
