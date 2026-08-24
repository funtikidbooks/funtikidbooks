import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/dang-nhap">) {
  const params = await searchParams;
  const nextParam = params?.next;
  const next = Array.isArray(nextParam) ? nextParam[0] : nextParam ?? "/workspace";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background:
          "linear-gradient(135deg, var(--color-accent-100) 0%, var(--color-bg) 45%, var(--color-accent-2-100) 100%)",
      }}
    >
      <AuthCard next={next} />
    </div>
  );
}
