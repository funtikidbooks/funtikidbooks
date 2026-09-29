"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { MAX_TIERS, draftFromPreset, type Quote, type QuoteDraft, type QuoteItem, type QuoteLang, type QuotePayment } from "@/lib/quote";

// Director only (sếp Phúc writes every quote himself) — the same rule as
// the quotes table's RLS.
async function requireQuoteEditor() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("access_role, display_name").eq("id", user.id).maybeSingle();
  if (profile?.access_role !== "director") {
    throw new Error("Chỉ Giám đốc được soạn báo giá.");
  }
  return { supabase, user, displayName: (profile?.display_name as string) ?? "" };
}

const SQL_HINT = "Cần chạy file SQL quotes.sql trong Supabase trước khi dùng Báo giá.";
// "*" rather than a column list, so a column added later (book_size,
// payments) never stops the page loading before its SQL has run.
const COLUMNS = "*";

// Columns added after the table: until their SQL has run, save everything
// else rather than fail the whole quote (the form says what to run).
const LATER_COLUMNS = ["book_size", "payments"] as const;
type LaterColumn = (typeof LATER_COLUMNS)[number];
function missingColumns(error: { code?: string; message?: string } | null): LaterColumn[] {
  if (!error) return [];
  const named = LATER_COLUMNS.filter((c) => (error.message ?? "").includes(c));
  if (named.length) return named;
  return error.code === "42703" || error.code === "PGRST204" ? [...LATER_COLUMNS] : [];
}
function without<T extends object>(row: T, cols: LaterColumn[]): T {
  const copy = { ...row } as Record<string, unknown>;
  for (const c of cols) delete copy[c];
  return copy as T;
}
// Insert or update, dropping a later column its SQL hasn't added yet (at
// most twice — once per such column). Returns what was left out.
async function writeQuote<T extends object, R>(row: T, write: (row: T) => PromiseLike<{ data: R; error: { code?: string; message?: string } | null }>) {
  let dropped: LaterColumn[] = [];
  let res = await write(row);
  for (let i = 0; i < 2 && missingColumns(res.error).length; i++) {
    dropped = [...new Set([...dropped, ...missingColumns(res.error)])];
    res = await write(without(row, dropped));
  }
  return { ...res, dropped };
}

export async function listQuotes(): Promise<{ quotes: Quote[]; ready: boolean }> {
  const { supabase } = await requireQuoteEditor();
  const { data, error } = await supabase.from("quotes").select(COLUMNS).order("created_at", { ascending: false }).limit(300);
  if (error) return { quotes: [], ready: false };
  return { quotes: (data ?? []) as Quote[], ready: true };
}

export async function getQuote(id: string): Promise<Quote | null> {
  const { supabase } = await requireQuoteEditor();
  const { data } = await supabase.from("quotes").select(COLUMNS).eq("id", id).maybeSingle();
  return (data as Quote | null) ?? null;
}

// BG-2026-007: the year's running number.
async function nextCode(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]) {
  const year = new Date(Date.now() + 7 * 3600e3).getUTCFullYear();
  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${year}-01-01T00:00:00+07:00`);
  return `BG-${year}-${String((count ?? 0) + 1).padStart(3, "0")}`;
}

export async function createQuote(presetId: string, language: QuoteLang): Promise<string> {
  const { supabase, user, displayName } = await requireQuoteEditor();
  const draft = draftFromPreset(presetId, language === "en" ? "en" : "vi", displayName);
  const row = { ...draft, code: await nextCode(supabase), created_by: user.id };
  const { data, error } = await writeQuote(row, (r) => supabase.from("quotes").insert(r).select("id").single());
  if (error || !data) throw new Error(error?.code === "42P01" ? SQL_HINT : "Không tạo được báo giá.");
  revalidatePath("/quan-tri/bao-gia");
  return data.id as string;
}

function clean(input: QuoteDraft): QuoteDraft {
  const tiers = Math.min(MAX_TIERS, Math.max(1, input.tier_names?.length ?? 1));
  const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const items: QuoteItem[] = (Array.isArray(input.items) ? input.items : []).slice(0, 200).map((it) => ({
    id: str(it.id, 40) || Math.random().toString(36).slice(2),
    kind: it.kind === "section" ? "section" : "item",
    name: str(it.name, 300),
    description: str(it.description, 2000),
    qty: Math.max(0, Math.min(100000, Number(it.qty) || 0)),
    qtys: Array.isArray(it.qtys) ? Array.from({ length: tiers }, (_, t) => Math.max(0, Math.min(100000, Number(it.qtys?.[t]) || 0))) : null,
    unit: str(it.unit, 40),
    prices: Array.from({ length: tiers }, (_, t) => num(it.prices?.[t])),
    flat: !!it.flat,
    optional: !!it.optional,
  }));
  const payments: QuotePayment[] = (Array.isArray(input.payments) ? input.payments : []).slice(0, 12).map((p) => ({
    id: str(p.id, 40) || Math.random().toString(36).slice(2),
    label: str(p.label, 200),
    percent: Math.max(0, Math.min(100, Math.round((Number(p.percent) || 0) * 100) / 100)),
  }));
  return {
    title: str(input.title, 300),
    client_name: str(input.client_name, 200),
    client_contact: str(input.client_contact, 300),
    book_size: str(input.book_size, 80),
    language: input.language === "en" ? "en" : "vi",
    currency: input.currency === "USD" ? "USD" : "VND",
    tier_names: Array.from({ length: tiers }, (_, t) => str(input.tier_names?.[t], 60)),
    tier_notes: Array.from({ length: tiers }, (_, t) => str(input.tier_notes?.[t], 300)),
    intro: str(input.intro, 3000),
    items,
    payments,
    terms: str(input.terms, 5000),
    valid_days: Math.max(1, Math.min(365, Math.round(Number(input.valid_days) || 14))),
    prepared_by: str(input.prepared_by, 120),
    status: (["draft", "sent", "accepted", "declined"] as const).includes(input.status) ? input.status : "draft",
  };
}

export async function saveQuote(id: string, input: QuoteDraft): Promise<string> {
  const { supabase } = await requireQuoteEditor();
  const updated_at = new Date().toISOString();
  const row = { ...clean(input), updated_at };
  const { error, dropped } = await writeQuote(row, (r) => supabase.from("quotes").update(r).eq("id", id).select("id"));
  if (error) throw new Error("Không lưu được báo giá.");
  const lost = dropped.filter((c) => (c === "book_size" ? !!row.book_size : row.payments.length > 0));
  if (lost.length)
    throw new Error(`Đã lưu, trừ ${lost.map((c) => (c === "book_size" ? "Khổ sách" : "Các đợt thanh toán")).join(" và ")} — cần chạy SQL trong quotes.sql.`);
  revalidatePath("/quan-tri/bao-gia");
  return updated_at;
}

export async function duplicateQuote(id: string): Promise<string> {
  const { supabase, user } = await requireQuoteEditor();
  const src = await getQuote(id);
  if (!src) throw new Error("Không tìm thấy báo giá.");
  const { id: _id, code: _code, created_at: _c, updated_at: _u, created_by: _b, ...rest } = src;
  void [_id, _code, _c, _u, _b];
  const row = {
    ...clean({ ...rest, book_size: rest.book_size ?? "", payments: rest.payments ?? [], status: "draft" }),
    title: rest.title ? `${rest.title} (bản sao)` : "",
    code: await nextCode(supabase),
    created_by: user.id,
  };
  const { data, error } = await writeQuote(row, (r) => supabase.from("quotes").insert(r).select("id").single());
  if (error || !data) throw new Error("Không nhân bản được báo giá.");
  revalidatePath("/quan-tri/bao-gia");
  return data.id as string;
}

export async function deleteQuote(id: string) {
  const { supabase } = await requireQuoteEditor();
  await supabase.from("quotes").delete().eq("id", id);
  revalidatePath("/quan-tri/bao-gia");
}
