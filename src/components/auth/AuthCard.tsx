"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn } from "@/lib/actions/auth";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function AuthCard({ next }: { next: string }) {
  const [loginState, loginAction] = useActionState(signIn, undefined);

  return (
    <div className="w-full max-w-[380px] card elev-lg p-8 flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <Image
          src="/brand/funti-logo.jpg"
          alt="Funti Kidbooks Studio"
          width={52}
          height={52}
          className="rounded-full object-cover"
        />
        <h1 className="text-xl">Funti Kidbooks Studio</h1>
        <p className="text-sm" style={{ color: "var(--color-neutral-600)" }}>
          Không gian làm việc dành cho thành viên studio
        </p>
      </div>

      <form action={loginAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            className="input"
            id="email"
            name="email"
            type="email"
            placeholder="name@funtikidbooks.com"
            required
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Mật khẩu</label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>
        {loginState?.error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {loginState.error}
          </p>
        )}
        <SubmitButton label="Đăng nhập" pendingLabel="Đang đăng nhập…" />
        <p className="text-center text-sm" style={{ color: "var(--color-neutral-600)" }}>
          Chưa có tài khoản? Liên hệ Giám đốc studio để được cấp tài khoản.
        </p>
      </form>

      <div className="flex items-center justify-center gap-4">
        <Link
          href="/"
          className="text-center text-sm font-semibold"
          style={{ color: "var(--color-neutral-500)" }}
        >
          ← Về trang chủ
        </Link>
        <Link
          href="/workspace-demo"
          className="text-center text-sm font-semibold"
          style={{ color: "var(--color-accent-2-700)" }}
        >
          Xem thử giao diện →
        </Link>
      </div>
    </div>
  );
}
