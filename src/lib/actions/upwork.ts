"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UPWORK_LIVE_CHANNEL, UPWORK_LIVE_EVENT } from "@/lib/upworkLive";
import { DEFAULT_UPWORK_SOP, normalizeSop, type UpworkSop } from "@/lib/upworkSop";
import { DEFAULT_UPWORK_FILTERS, normalizeFilters, type UpworkFilters } from "@/lib/upworkFilters";
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

// Every lead from a set of hourly checks — one day's worth, for the page's
// day-by-day view.
export async function listUpworkLeadsForBatches(batchIds: string[]): Promise<UpworkLead[]> {
  const { supabase } = await requireDirectorOrPM();
  const ids = batchIds.slice(0, 200);
  if (ids.length === 0) return [];
  const { data } = await supabase.from("upwork_leads").select("*").in("batch_id", ids).order("created_at", { ascending: true });
  return (data ?? []) as UpworkLead[];
}

// Just what the Hiệu quả tab counts (and its filter preview reads), for every lead so far.
export async function listUpworkLeadStats(): Promise<
  {
    batch_id: string;
    status: string;
    fit_score: number | null;
    template_name: string | null;
    created_at: string;
    job_title: string;
    budget_text: string | null;
  }[]
> {
  const { supabase } = await requireDirectorOrPM();
  const full = await supabase
    .from("upwork_leads")
    .select("batch_id, status, fit_score, template_name, created_at, job_title, budget_text")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (!full.error) return (full.data ?? []) as Awaited<ReturnType<typeof listUpworkLeadStats>>;
  // fit_score / template_name not added yet (upwork_night_email.sql) — count the rest.
  const plain = await supabase
    .from("upwork_leads")
    .select("batch_id, status, created_at, job_title, budget_text")
    .order("created_at", { ascending: false })
    .limit(5000);
  return (plain.data ?? []).map((l) => ({
    ...(l as { batch_id: string; status: string; created_at: string; job_title: string; budget_text: string | null }),
    fit_score: null,
    template_name: null,
  }));
}

// Yêu cầu đầu vào — sếp's numbers for which jobs get a proposal. Kept in
// site_settings (read by scripts/upwork-night.mjs each hour); written with
// the service role so the Project Manager can set them too.
const FILTERS_KEY = "upwork_filters";

export async function getUpworkFilters(): Promise<UpworkFilters> {
  const { supabase } = await requireDirectorOrPM();
  const { data } = await supabase.from("site_settings").select("value").eq("key", FILTERS_KEY).maybeSingle();
  if (!data?.value) return DEFAULT_UPWORK_FILTERS;
  try {
    return normalizeFilters(JSON.parse(data.value));
  } catch {
    return DEFAULT_UPWORK_FILTERS;
  }
}

export async function saveUpworkFilters(input: UpworkFilters): Promise<UpworkFilters> {
  await requireDirectorOrPM();
  const filters = normalizeFilters(input);
  const admin = createAdminClient();
  const { error } = await admin
    .from("site_settings")
    .upsert({ key: FILTERS_KEY, value: JSON.stringify(filters), updated_at: new Date().toISOString() });
  if (error) throw new Error("Không lưu được yêu cầu.");
  revalidatePath("/quan-tri/upwork");
  return filters;
}

// Tell every open Upwork page to refetch this batch (see lib/upworkLive.ts).
// Best-effort: a failed ping only means someone reloads by hand.
async function pingUpworkLive(batchId: string | null | undefined) {
  if (!batchId) return;
  const admin = createAdminClient();
  const channel = admin.channel(UPWORK_LIVE_CHANNEL);
  try {
    await channel.httpSend(UPWORK_LIVE_EVENT, { batchId });
  } catch {
    // ignore
  } finally {
    await admin.removeChannel(channel);
  }
}

// "sent" is set by hand once sếp has actually pasted the (possibly edited)
// draft into Upwork himself and clicked submit there — nothing in this app
// ever calls Upwork's API to send a proposal.
export async function updateUpworkLeadStatus(leadId: string, status: UpworkLeadStatus) {
  const { supabase, user } = await requireDirectorOrPM();
  const { data } = await supabase
    .from("upwork_leads")
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", leadId)
    .select("batch_id")
    .maybeSingle();
  await pingUpworkLive(data?.batch_id as string | undefined);
  revalidatePath("/quan-tri/upwork");
}

export async function updateUpworkLeadDraft(leadId: string, proposalDraft: string) {
  const { supabase } = await requireDirectorOrPM();
  const trimmed = proposalDraft.trim();
  if (!trimmed) throw new Error("Nội dung proposal không được để trống.");
  const { data } = await supabase
    .from("upwork_leads")
    .update({ proposal_draft: trimmed })
    .eq("id", leadId)
    .select("batch_id")
    .maybeSingle();
  await pingUpworkLive(data?.batch_id as string | undefined);
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

// The built-in copy of the original deck until a row exists (or before
// supabase/migrations/upwork_sop.sql has been run).
export async function getUpworkSop(): Promise<{ sop: UpworkSop; saved: boolean }> {
  const { supabase } = await requireDirectorOrPM();
  const { data } = await supabase.from("upwork_sop").select("content").eq("id", "default").maybeSingle();
  return data ? { sop: normalizeSop(data.content), saved: true } : { sop: DEFAULT_UPWORK_SOP, saved: false };
}

export async function saveUpworkSop(input: UpworkSop): Promise<UpworkSop> {
  const { supabase, user } = await requireDirectorOrPM();
  const sop = normalizeSop(input);
  if (JSON.stringify(sop).length > 200_000) throw new Error("SOP quá dài.");
  const { error } = await supabase
    .from("upwork_sop")
    .upsert({ id: "default", content: sop, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) throw new Error("Không thể lưu SOP — cần chạy file SQL upwork_sop.sql trong Supabase trước.");
  revalidatePath("/quan-tri/upwork");
  return sop;
}
