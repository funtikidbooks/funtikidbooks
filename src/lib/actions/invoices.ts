"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Invoice, InvoiceItem, InvoiceStatus } from "@/lib/types";

async function requireDirector() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_role !== "director") {
    throw new Error("Chỉ Giám đốc mới có quyền này.");
  }

  return { supabase, user };
}

async function nextInvoiceNumber(supabase: Awaited<ReturnType<typeof createClient>>) {
  const year = new Date().getFullYear();
  const prefix = `HD-${year}-`;
  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .like("invoice_number", `${prefix}%`);
  const seq = (count ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function listInvoices(): Promise<Invoice[]> {
  const { supabase } = await requireDirector();
  const { data } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
  return (data ?? []) as Invoice[];
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const { supabase } = await requireDirector();
  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  return (data as Invoice) ?? null;
}

export async function createInvoice(input: {
  clientName: string;
  clientAddress?: string;
  clientTaxCode?: string;
  clientEmail?: string;
  issueDate: string;
  dueDate?: string;
  items: InvoiceItem[];
  taxRate: number;
  note?: string;
}): Promise<Invoice> {
  const { supabase, user } = await requireDirector();
  const clientName = input.clientName.trim();
  if (!clientName) throw new Error("Thiếu tên khách hàng");
  if (input.items.length === 0) throw new Error("Hoá đơn cần ít nhất 1 mục");

  const invoiceNumber = await nextInvoiceNumber(supabase);

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      client_name: clientName,
      client_address: input.clientAddress?.trim() || null,
      client_tax_code: input.clientTaxCode?.trim() || null,
      client_email: input.clientEmail?.trim() || null,
      issue_date: input.issueDate,
      due_date: input.dueDate || null,
      items: input.items,
      tax_rate: input.taxRate,
      note: input.note?.trim() || null,
      status: "draft",
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error("Không thể tạo hoá đơn");

  revalidatePath("/quan-tri/hoa-don");
  return data as Invoice;
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus) {
  const { supabase } = await requireDirector();
  const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
  if (error) throw new Error("Không thể cập nhật trạng thái hoá đơn");
  revalidatePath("/quan-tri/hoa-don");
}

export async function deleteInvoice(id: string) {
  const { supabase } = await requireDirector();
  await supabase.from("invoices").delete().eq("id", id);
  revalidatePath("/quan-tri/hoa-don");
}
