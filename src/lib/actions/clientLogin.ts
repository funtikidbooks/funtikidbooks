"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// The Công việc portal signs clients in with an emailed link. A staff
// address must never get one: clicking it would open that staff account —
// the director's included — with no password at all (sếp Phúc, 1/10:
// funtikidbooks@gmail.com signs in only with the password he set). The
// database refuses such a sign-in anyway (staff_password_only_hook.sql);
// this just stops the email being sent and says why.
export async function isStaffEmail(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!e || e.length > 254) return false;
  const admin = createAdminClient();
  const pattern = e.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await admin.from("profiles").select("id").ilike("email", pattern).limit(1);
  return (data ?? []).length > 0;
}
