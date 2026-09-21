import type { Metadata } from "next";
import { LegalDocument, type LegalCopy } from "@/components/site/LegalDocument";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng",
  description: "Điều khoản sử dụng website và dịch vụ của Funti Kidbooks Studio.",
};

const vi: LegalCopy = {
  title: "Điều khoản sử dụng",
  updated: "Cập nhật lần cuối: 09/2026",
  intro: "Khi truy cập website và sử dụng dịch vụ của Funti Kidbooks Studio, bạn đồng ý với các điều khoản dưới đây.",
  sections: [
    {
      heading: "1. Dịch vụ",
      body: [
        "Funti Kidbooks Studio cung cấp dịch vụ minh hoạ và thiết kế sách thiếu nhi. Phạm vi, tiến độ và chi phí của từng dự án được thống nhất bằng báo giá hoặc hợp đồng riêng.",
      ],
    },
    {
      heading: "2. Báo giá và thanh toán",
      body: [
        "Bảng giá trên website chỉ mang tính tham khảo. Chi phí chính thức được xác nhận trong báo giá/hợp đồng cho từng dự án, cùng các mốc và phương thức thanh toán.",
      ],
    },
    {
      heading: "3. Quyền sở hữu trí tuệ",
      body: [
        "Toàn bộ nội dung, hình ảnh và tác phẩm hiển thị trên website thuộc quyền của Funti Kidbooks Studio hoặc chủ sở hữu tương ứng, không được sao chép hay sử dụng lại khi chưa được phép. Quyền sử dụng tác phẩm của từng dự án được quy định trong hợp đồng.",
      ],
    },
    {
      heading: "4. Trách nhiệm của khách hàng",
      body: [
        "Khách hàng cung cấp thông tin chính xác, có quyền sử dụng các tài liệu gửi cho chúng tôi và phản hồi đúng hạn để đảm bảo tiến độ dự án.",
      ],
    },
    {
      heading: "5. Giới hạn trách nhiệm",
      body: [
        "Website được cung cấp trên cơ sở hiện có. Chúng tôi nỗ lực đảm bảo thông tin chính xác nhưng có thể thay đổi nội dung mà không báo trước.",
      ],
    },
    {
      heading: "6. Thay đổi điều khoản",
      body: [
        "Chúng tôi có thể cập nhật điều khoản này theo thời gian; phiên bản mới có hiệu lực khi được đăng trên website. Liên hệ: funtikidbooks.studio@gmail.com.",
      ],
    },
  ],
};

const en: LegalCopy = {
  title: "Terms of Use",
  updated: "Last updated: 09/2026",
  intro: "By visiting our website and using the services of Funti Kidbooks Studio, you agree to the terms below.",
  sections: [
    {
      heading: "1. Services",
      body: [
        "Funti Kidbooks Studio provides children's book illustration and design services. The scope, schedule and cost of each project are agreed in a separate quote or contract.",
      ],
    },
    {
      heading: "2. Quotes and payment",
      body: [
        "Prices on the website are indicative only. Final fees, milestones and payment methods are confirmed in the quote or contract for each project.",
      ],
    },
    {
      heading: "3. Intellectual property",
      body: [
        "All content, images and artwork on this website belong to Funti Kidbooks Studio or their respective owners and may not be copied or reused without permission. Usage rights for each project's work are set out in its contract.",
      ],
    },
    {
      heading: "4. Client responsibilities",
      body: [
        "Clients provide accurate information, hold the rights to materials they send us, and respond in a timely manner to keep the project on schedule.",
      ],
    },
    {
      heading: "5. Limitation of liability",
      body: [
        "The website is provided as is. We aim to keep information accurate but may change content without notice.",
      ],
    },
    {
      heading: "6. Changes to these terms",
      body: [
        "We may update these terms from time to time; the new version takes effect when posted on the website. Contact: funtikidbooks.studio@gmail.com.",
      ],
    },
  ],
};

export default function TermsPage() {
  return <LegalDocument vi={vi} en={en} />;
}
