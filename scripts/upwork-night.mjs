// Bridge between the overnight Upwork session and the website.
//
//   node scripts/upwork-night.mjs context
//     Prints (JSON) the SOP and proposal templates saved on
//     /quan-tri/upwork, plus every job URL already reported in the last
//     30 days so the night run doesn't report the same job twice.
//
//   node scripts/upwork-night.mjs report <file.json>
//     Saves one night's results as a batch on the "Đợt tìm khách" tab:
//     { "note": "...", "jobsFound": 12, "leads": [ { job_title, job_url,
//       budget_text, client_info, match_reason, proposal_draft } ] }
//     Leads land as "Chờ duyệt" — nothing is ever sent to Upwork from here.
//
// Runs locally with the service-role key from .env.local.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_UPWORK_SOP, normalizeSop } from "../src/lib/upworkSop.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function fail(message) {
  console.error(message);
  process.exit(1);
}

// "https://www.upwork.com/jobs/~01abc?referrer=…" and ".../freelance-jobs/apply/…_~01abc/" both → "~01abc"
function jobKey(url) {
  const m = /~0[0-9a-z]+/i.exec(url);
  return m ? m[0].toLowerCase() : url.split("?")[0].replace(/\/+$/, "").toLowerCase();
}

async function context() {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [sopRes, tplRes, leadsRes] = await Promise.all([
    db.from("upwork_sop").select("content, updated_at").eq("id", "default").maybeSingle(),
    db.from("upwork_proposal_templates").select("name, job_type, content").order("sort_order"),
    db.from("upwork_leads").select("job_url").gte("created_at", since),
  ]);
  if (tplRes.error) fail("Không đọc được mẫu proposal: " + tplRes.error.message);
  console.log(
    JSON.stringify(
      {
        sop: sopRes.data ? normalizeSop(sopRes.data.content) : DEFAULT_UPWORK_SOP,
        sopNote: sopRes.data ? `Bản studio, sửa lần cuối ${sopRes.data.updated_at}` : "Bản gốc SOP-01 (studio chưa sửa trên web)",
        templates: tplRes.data ?? [],
        alreadyReportedJobKeys: [...new Set((leadsRes.data ?? []).map((l) => jobKey(l.job_url)))],
      },
      null,
      2,
    ),
  );
}

async function report(file) {
  if (!file) fail("Thiếu đường dẫn file JSON kết quả.");
  let input;
  try {
    input = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail("File kết quả không phải JSON hợp lệ: " + e.message);
  }
  const leads = Array.isArray(input.leads) ? input.leads : [];
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: recent } = await db.from("upwork_leads").select("job_url").gte("created_at", since);
  const seen = new Set((recent ?? []).map((l) => jobKey(l.job_url)));

  const rows = [];
  for (const l of leads) {
    const job_url = str(l.job_url, 500);
    if (!/^https:\/\/(www\.)?upwork\.com\//i.test(job_url)) continue;
    const key = jobKey(job_url);
    if (seen.has(key)) continue;
    seen.add(key);
    const job_title = str(l.job_title, 300);
    const proposal_draft = str(l.proposal_draft, 6000);
    if (!job_title || !proposal_draft) continue;
    rows.push({
      job_title,
      job_url,
      budget_text: str(l.budget_text, 200) || null,
      client_info: str(l.client_info, 600) || null,
      match_reason: str(l.match_reason, 1500) || null,
      proposal_draft,
    });
  }

  const { data: batch, error: bErr } = await db
    .from("upwork_batches")
    .insert({
      jobs_found: Number.isFinite(input.jobsFound) ? Math.max(0, Math.round(input.jobsFound)) : rows.length,
      leads_drafted: rows.length,
      note: str(input.note, 2000) || null,
    })
    .select("id")
    .single();
  if (bErr) fail("Không tạo được đợt báo cáo: " + bErr.message);

  if (rows.length) {
    const { error: lErr } = await db.from("upwork_leads").insert(rows.map((r) => ({ ...r, batch_id: batch.id })));
    if (lErr) {
      await db.from("upwork_batches").delete().eq("id", batch.id);
      fail("Không lưu được job: " + lErr.message);
    }
  }
  console.log(JSON.stringify({ batchId: batch.id, saved: rows.length, skipped: leads.length - rows.length }));
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "context") await context();
else if (cmd === "report") await report(arg);
else fail("Dùng: node scripts/upwork-night.mjs context | report <file.json>");
