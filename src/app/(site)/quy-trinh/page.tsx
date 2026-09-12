import type { Metadata } from "next";
import { ProcessContent } from "./ProcessContent";

const PAGE_DESCRIPTION =
  "Quy trình 6 bước làm việc của Funti Kidbooks Studio — từ tiếp nhận yêu cầu, nghiên cứu ý tưởng, phác thảo, minh hoạ đến bàn giao file chuẩn in ấn.";

export const metadata: Metadata = {
  title: "Quy trình",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Quy trình · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Quy trình · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

export default function ProcessPage() {
  return <ProcessContent />;
}
