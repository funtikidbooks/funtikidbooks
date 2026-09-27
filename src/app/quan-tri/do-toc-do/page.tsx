import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { LatencyTest } from "./LatencyTest";

export const metadata: Metadata = { title: "Quản trị — Đo tốc độ chat" };

export default async function LatencyTestPage() {
  const { user } = await requireUser();
  return <LatencyTest userId={user.id} />;
}
