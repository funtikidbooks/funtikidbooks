"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import type { UpworkBatch, UpworkLead, UpworkLeadStatus, UpworkProposalTemplate } from "@/lib/types";

// Director, or any staff whose chức danh is exactly "Project Manager" —
// mirrors the can_manage_hr()/is_director_or_pm() RLS helper in
// supabase/schema.sql. Deliberately excludes plain "admin" access_role —
// sếp only wants director + PM seeing draft client outreach.
async function requireDirectorOrPM() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("access_role, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_role !== "director" && profile?.role !== "Project Manager") {
    throw new Error("Bạn không có quyền xem trang này.");
  }

  return { supabase, user };
}

export async function listUpworkBatches(): Promise<UpworkBatch[]> {
  const { supabase } = await requireDirectorOrPM();
  const { data } = await supabase.from("upwork_batches").select("*").order("ran_at", { ascending: false });
  return (data ?? []) as UpworkBatch[];
}

export async function listUpworkLeads(batchId: string): Promise<UpworkLead[]> {
  const { supabase } = await requireDirectorOrPM();
  const { data } = await supabase
    .from("upwork_leads")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  return (data ?? []) as UpworkLead[];
}

// "sent" is set by hand once sếp has actually pasted the (possibly edited)
// draft into Upwork himself and clicked submit there — nothing in this app
// ever calls Upwork's API to send a proposal.
export async function updateUpworkLeadStatus(leadId: string, status: UpworkLeadStatus) {
  const { supabase, user } = await requireDirectorOrPM();
  await supabase
    .from("upwork_leads")
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", leadId);
  revalidatePath("/quan-tri/upwork");
}

export async function updateUpworkLeadDraft(leadId: string, proposalDraft: string) {
  const { supabase } = await requireDirectorOrPM();
  const trimmed = proposalDraft.trim();
  if (!trimmed) throw new Error("Nội dung proposal không được để trống.");
  await supabase.from("upwork_leads").update({ proposal_draft: trimmed }).eq("id", leadId);
  revalidatePath("/quan-tri/upwork");
}

// Empty (not an error) until supabase/migrations/upwork_proposal_templates.sql
// has been run, so the report tab keeps working either way.
export async function listProposalTemplates(): Promise<UpworkProposalTemplate[]> {
  const { supabase } = await requireDirectorOrPM();
  const { data } = await supabase
    .from("upwork_proposal_templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as UpworkProposalTemplate[];
}

function cleanTemplate(input: { name: string; jobType: string; content: string }) {
  const name = input.name.trim();
  const content = input.content.trim();
  if (!name) throw new Error("Mẫu cần có tên.");
  if (!content) throw new Error("Nội dung mẫu không được để trống.");
  return { name, job_type: input.jobType.trim() || null, content };
}

export async function createProposalTemplate(input: { name: string; jobType: string; content: string }): Promise<UpworkProposalTemplate> {
  const { supabase, user } = await requireDirectorOrPM();
  const { data: last } = await supabase
    .from("upwork_proposal_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("upwork_proposal_templates")
    .insert({ ...cleanTemplate(input), sort_order: (last?.sort_order ?? 0) + 1, created_by: user.id })
    .select("*")
    .single();
  if (error || !data) throw new Error("Không thể lưu mẫu — cần chạy file SQL upwork_proposal_templates.sql trong Supabase trước.");
  revalidatePath("/quan-tri/upwork");
  return data as UpworkProposalTemplate;
}

export async function updateProposalTemplate(
  id: string,
  input: { name: string; jobType: string; content: string },
): Promise<UpworkProposalTemplate> {
  const { supabase } = await requireDirectorOrPM();
  const { data, error } = await supabase.from("upwork_proposal_templates").update(cleanTemplate(input)).eq("id", id).select("*").single();
  if (error || !data) throw new Error("Không thể lưu mẫu.");
  revalidatePath("/quan-tri/upwork");
  return data as UpworkProposalTemplate;
}

export async function deleteProposalTemplate(id: string) {
  const { supabase } = await requireDirectorOrPM();
  await supabase.from("upwork_proposal_templates").delete().eq("id", id);
  revalidatePath("/quan-tri/upwork");
}
