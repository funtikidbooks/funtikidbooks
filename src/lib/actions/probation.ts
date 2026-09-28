"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { sendOfficialStaffEmail } from "@/lib/mail";
import type { StaffProbation } from "@/lib/types";

// Same "director or chức danh Project Manager" rule as can_manage_hr() —
// the staff_probation RLS enforces it too, this just gives a clear message.
async function requireDirectorOrPM() {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("profiles").select("access_role, role").eq("id", user.id).maybeSingle();
  if (me?.access_role !== "director" && me?.role !== "Project Manager") {
    throw new Error("Chỉ Giám đốc hoặc Project Manager mới xác nhận được nhân viên chính thức.");
  }
  return { supabase, user };
}

export async function listStaffProbation(): Promise<StaffProbation[]> {
  const { supabase } = await requireUser();
  // Before staff_probation.sql has been run the table doesn't exist — treat
  // that as "nobody confirmed yet" instead of breaking the page.
  const { data, error } = await supabase.from("staff_probation").select("*");
  if (error) return [];
  return (data ?? []) as StaffProbation[];
}

export async function confirmOfficialStaff(input: {
  profileId: string;
  officialAt: string;
  subject: string;
  message: string;
}): Promise<{ row: StaffProbation; emailed: boolean; emailError: string | null }> {
  const { supabase, user } = await requireDirectorOrPM();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.officialAt)) throw new Error("Ngày chính thức không hợp lệ.");

  const { data: staff } = await supabase
    .from("profiles")
    .select("email, display_name")
    .eq("id", input.profileId)
    .maybeSingle();
  if (!staff) throw new Error("Không tìm thấy nhân viên.");

  const { data: row, error } = await supabase
    .from("staff_probation")
    .upsert({ profile_id: input.profileId, official_at: input.officialAt, confirmed_by: user.id })
    .select("*")
    .single();
  if (error || !row) {
    throw new Error(
      error?.code === "42P01" || /staff_probation/.test(error?.message ?? "")
        ? "Chưa chạy file SQL staff_probation.sql trên Supabase."
        : "Không lưu được: " + (error?.message ?? "lỗi không rõ"),
    );
  }

  let emailed = false;
  let emailError: string | null = null;
  if (staff.email) {
    try {
      emailed = await sendOfficialStaffEmail({ to: staff.email, subject: input.subject, message: input.message });
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Gửi mail thất bại.";
    }
  } else {
    emailError = "Nhân viên chưa có email.";
  }

  let saved = row as StaffProbation;
  if (emailed) {
    const { data: stamped } = await supabase
      .from("staff_probation")
      .update({ emailed_at: new Date().toISOString() })
      .eq("profile_id", input.profileId)
      .select("*")
      .single();
    if (stamped) saved = stamped as StaffProbation;
  }

  revalidatePath("/quan-tri/nhan-su");
  revalidatePath("/workspace/thanh-vien");
  return { row: saved, emailed, emailError };
}

// When the letter went out some other way (the Gmail fallback) — just
// records that it was sent.
export async function markOfficialEmailSent(profileId: string): Promise<StaffProbation | null> {
  const { supabase } = await requireDirectorOrPM();
  const { data } = await supabase
    .from("staff_probation")
    .update({ emailed_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .select("*")
    .single();
  return (data as StaffProbation) ?? null;
}

// Undo a mistaken confirmation — they're back on (or past) probation.
export async function revertOfficialStaff(profileId: string) {
  const { supabase } = await requireDirectorOrPM();
  const { error } = await supabase.from("staff_probation").delete().eq("profile_id", profileId);
  if (error) throw new Error("Không huỷ được: " + error.message);
  revalidatePath("/quan-tri/nhan-su");
  revalidatePath("/workspace/thanh-vien");
}
