"use server";

import { createClient } from "@/lib/supabase/server";

export type ContactState = { success?: boolean; error?: string } | undefined;

export async function submitContactForm(
  _prevState: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const full_name = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  const project_type = String(formData.get("projectType") || "").trim() || null;
  const message = String(formData.get("message") || "").trim();

  if (!full_name || !email || !message) {
    return { error: "Vui lòng điền đầy đủ các trường bắt buộc (*)." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_messages")
    .insert({ full_name, email, phone, project_type, message });

  if (error) {
    return { error: "Không thể gửi tin nhắn lúc này. Vui lòng thử lại sau." };
  }

  return { success: true };
}
