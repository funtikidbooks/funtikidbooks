// Bridge between the overnight Upwork session and the website.
//
//   node scripts/upwork-night.mjs context
//     Prints (JSON) the SOP and proposal templates saved on
//     /quan-tri/upwork, every job already reported in the last 30 days (so
//     the same job is never reported twice) and when the previous run
//     finished (only newer job-alert emails need reading).
//
//   node scripts/upwork-night.mjs report <file.json>
//     Saves one run's results as a batch on the "Đợt tìm khách" tab:
//     { "note": "...", "jobsFound": 12, "leads": [ { job_title, job_url,
//       budget_text, client_info, match_reason, proposal_draft, fit_score,
//       recommendation, template_name, client_region, send_window,
//       posted_at } ] }
//     Leads land as "Chờ duyệt" — nothing is ever sent to Upwork from here.
//
//   node scripts/upwork-night.mjs notify
//     Push notification to the director and every Project Manager with the
//     night's totals (every batch since 00:00 Vietnam time) — sent once, by
//     the last run of the night, so nobody gets woken at 1am.
//
// Runs locally with the service-role key from .env.local.

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
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
  const [sopRes, tplRes, leadsRes, lastRes] = await Promise.all([
    db.from("upwork_sop").select("content, updated_at").eq("id", "default").maybeSingle(),
    db.from("upwork_proposal_templates").select("name, job_type, content").order("sort_order"),
    db.from("upwork_leads").select("job_url").gte("created_at", since),
    db.from("upwork_batches").select("ran_at").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (tplRes.error) fail("Không đọc được mẫu proposal: " + tplRes.error.message);
  console.log(
    JSON.stringify(
      {
        sop: sopRes.data ? normalizeSop(sopRes.data.content) : DEFAULT_UPWORK_SOP,
        sopNote: sopRes.data ? `Bản studio, sửa lần cuối ${sopRes.data.updated_at}` : "Bản gốc SOP-01 (studio chưa sửa trên web)",
        templates: tplRes.data ?? [],
        alreadyReportedJobKeys: [...new Set((leadsRes.data ?? []).map((l) => jobKey(l.job_url)))],
        lastRunAt: lastRes.data?.ran_at ?? null,
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
    const fit = Number(l.fit_score);
    const posted = typeof l.posted_at === "string" && !Number.isNaN(Date.parse(l.posted_at)) ? new Date(l.posted_at).toISOString() : null;
    rows.push({
      job_title,
      job_url,
      budget_text: str(l.budget_text, 200) || null,
      client_info: str(l.client_info, 600) || null,
      match_reason: str(l.match_reason, 1500) || null,
      proposal_draft,
      fit_score: Number.isInteger(fit) && fit >= 1 && fit <= 5 ? fit : null,
      recommendation: l.recommendation === "strong" || l.recommendation === "maybe" ? l.recommendation : null,
      template_name: str(l.template_name, 120) || null,
      client_region: str(l.client_region, 120) || null,
      send_window: str(l.send_window, 120) || null,
      posted_at: posted,
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
    let { error: lErr } = await db.from("upwork_leads").insert(rows.map((r) => ({ ...r, batch_id: batch.id })));
    // upwork_night_email.sql not run yet — save without the new columns
    // rather than losing the night's work.
    if (lErr && /fit_score|recommendation|template_name|client_region|send_window|posted_at/.test(lErr.message)) {
      const legacy = rows.map((r) => {
        const row = { ...r, batch_id: batch.id };
        for (const k of ["fit_score", "recommendation", "template_name", "client_region", "send_window", "posted_at"]) delete row[k];
        return row;
      });
      ({ error: lErr } = await db.from("upwork_leads").insert(legacy));
    }
    if (lErr) {
      await db.from("upwork_batches").delete().eq("id", batch.id);
      fail("Không lưu được job: " + lErr.message);
    }
  }
  console.log(JSON.stringify({ batchId: batch.id, saved: rows.length, skipped: leads.length - rows.length }));
}

async function notify() {
  const req = createRequire(import.meta.url);
  const webpush = req("web-push");
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) fail("Thiếu khoá VAPID trong .env.local.");
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  // Tonight = since 00:00 Vietnam time (UTC+7, no DST).
  const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
  const since = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()) - 7 * 3600 * 1000).toISOString();
  const { data: batches } = await db.from("upwork_batches").select("id, jobs_found, note").gte("ran_at", since);
  const ids = (batches ?? []).map((b) => b.id);
  let leads = [];
  if (ids.length) {
    const r = await db.from("upwork_leads").select("*").in("batch_id", ids);
    leads = r.data ?? [];
  }
  const seen = (batches ?? []).reduce((s, b) => s + (b.jobs_found ?? 0), 0);
  const strong = leads.filter((l) => l.recommendation === "strong").length;
  const problem = (batches ?? []).map((b) => b.note ?? "").find((n) => /chưa kết nối|lỗi|không đọc được/i.test(n));

  const title = "🎯 Ca đêm Upwork";
  const body = problem
    ? `Có sự cố: ${problem.slice(0, 120)}`
    : leads.length
      ? `${seen} job mới · ${leads.length} job phù hợp${strong ? ` (${strong} rất hợp)` : ""} · đã soạn ${leads.length} proposal — vào duyệt nhé`
      : `${seen} job mới, không có job nào hợp SOP đêm nay.`;

  const { data: people } = await db.from("profiles").select("id, access_role, role");
  const userIds = (people ?? []).filter((p) => p.access_role === "director" || p.role === "Project Manager").map((p) => p.id);
  const { data: subs } = await db.from("push_subscriptions").select("*").in("user_id", userIds);
  const payload = JSON.stringify({ title, body, senderId: "upwork-night", url: "/quan-tri/upwork", tag: "upwork-night" });
  let sent = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { urgency: "high", TTL: 60 * 60 * 12 });
      sent++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
    }
  }
  console.log(JSON.stringify({ body, recipients: userIds.length, devices: sent }));
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "context") await context();
else if (cmd === "report") await report(arg);
else if (cmd === "notify") await notify();
else fail("Dùng: node scripts/upwork-night.mjs context | report <file.json> | notify");
