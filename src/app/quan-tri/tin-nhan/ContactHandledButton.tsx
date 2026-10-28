"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setContactMessageHandled } from "@/lib/actions/admin";

// "Đã trả lời" / "Chưa trả lời" on one Liên hệ form entry.
export function ContactHandledButton({ id, handled }: { id: string; handled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setContactMessageHandled(id, !handled);
        window.dispatchEvent(new Event("funti-customer-waiting-changed"));
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
      }
    });
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`btn btn-sm ${handled ? "btn-ghost" : "btn-primary"}`}
        title={handled ? "Bỏ đánh dấu — đưa lại vào danh sách khách chờ" : "Đã trả lời khách (qua email/điện thoại)"}
      >
        {pending ? "…" : handled ? "↺ Chưa trả lời" : "✓ Đã trả lời"}
      </button>
      {error && (
        <span className="text-[11px]" style={{ color: "var(--status-red)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
