"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { customerPush, customerStaffIds, previewOf } from "@/lib/customerWaiting";
import { sendContactFormEmail } from "@/lib/mail";

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

  // Used to notify nobody — the entry just sat in Quản trị → Form liên hệ.
  after(async () => {
    await customerPush({
      title: `🟠 KHÁCH ĐIỀN FORM LIÊN HỆ: ${full_name}`,
      body: `${previewOf(message)}
👉 Trả lời qua email ${email}`,
      url: "/quan-tri/tin-nhan",
      tag: "funti-contact-form",
    }).catch(() => {});
    const ids = await customerStaffIds();
    const { data: staff } = ids.length ? await createAdminClient().from("profiles").select("email").in("id", ids) : { data: [] };
    await Promise.all(
      (staff ?? []).map((s) =>
        s.email
          ? sendContactFormEmail({ to: s.email, fullName: full_name, email, phone, projectType: project_type, message }).catch(() => {})
          : Promise.resolve(),
      ),
    );
  });

  return { success: true };
}
