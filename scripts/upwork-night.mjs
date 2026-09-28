// Bridge between the overnight Upwork session and the website.
//
//   node scripts/upwork-night.mjs context
//     Prints (JSON) the SOP and proposal templates saved on
//     /quan-tri/upwork, every job already reported in the last 30 days (so
//     the same job is never reported twice), when the previous run
//     finished (only newer job-alert emails need reading), the current
//     Vietnam time and the fixed path the run writes its report to.
//
//   node scripts/upwork-night.mjs report [file.json]
//     Saves one run's results as a batch on the "Đợt tìm khách" tab, deletes
//     the file, then sends whatever notification the hour calls for (see
//     notifyAuto). Without a path it reads REPORT_FILE, so an unattended
//     hourly run only ever needs two exact commands — context and report —
//     both pre-allowed in .claude/settings.local.json (no permission prompts).
//     { "note": "...", "jobsFound": 12, "leads": [ { job_title, job_url,
//       budget_text, client_info, match_reason, proposal_draft, fit_score,
//       recommendation, template_name, client_region, send_window,
//       posted_at } ] }
//     Leads land as "Chờ duyệt" — nothing is ever sent to Upwork from here.
//
//   node scripts/upwork-night.mjs notify-batch <batchId> | notify-night
//     The two notifications on their own, for testing.
//
// Runs locally with the service-role key from .env.local.

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
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

// Fixed, not os.tmpdir(): Claude sessions may point TMP elsewhere, and the
// permission rule that lets the night run write this file names this path.
const REPORT_FILE = path.join(os.homedir(), "AppData", "Local", "Temp", "upwork-night-report.json");

// Vietnam is UTC+7 all year (no DST).
function vietnamNow() {
  const vn = new Date(Date.now() + 7 * 3600 * 1000);
  return { iso: vn.toISOString().replace("Z", "+07:00"), hour: vn.getUTCHours() };
}

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
  const now = vietnamNow();
  console.log(
    JSON.stringify(
      {
        sop: sopRes.data ? normalizeSop(sopRes.data.content) : DEFAULT_UPWORK_SOP,
        sopNote: sopRes.data ? `Bản studio, sửa lần cuối ${sopRes.data.updated_at}` : "Bản gốc SOP-01 (studio chưa sửa trên web)",
        templates: tplRes.data ?? [],
        alreadyReportedJobKeys: [...new Set((leadsRes.data ?? []).map((l) => jobKey(l.job_url)))],
        lastRunAt: lastRes.data?.ran_at ?? null,
        vietnamNow: now.iso,
        reportFile: REPORT_FILE,
      },
      null,
      2,
    ),
  );
}

async function report(file = REPORT_FILE) {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
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
  fs.rmSync(file, { force: true });
  const notice = await notifyAuto(batch.id);
  console.log(JSON.stringify({ batchId: batch.id, saved: rows.length, skipped: leads.length - rows.length, notice }));
}

// Which notification this check sends, by the hour in Vietnam — decided
// here so the scheduled run never has to:
//   07:xx          one summary of the night (22:00 → now)
//   08:00–21:59    an instant push if this check found jobs
//   22:00–06:59    nothing (nobody gets woken)
async function notifyAuto(batchId) {
  const { hour } = vietnamNow();
  if (hour === 7) return notifyNight({ quiet: true });
  if (hour >= 8 && hour < 22) return notifyBatch(batchId, { quiet: true });
  return "giờ nghỉ 22:00–07:00 — không gửi thông báo";
}

// Push to the director and every Project Manager (same devices the chat
// notifications use). Returns how many devices it reached.
async function push(title, body) {
  const req = createRequire(import.meta.url);
  const webpush = req("web-push");
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) fail("Thiếu khoá VAPID trong .env.local.");
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const { data: people } = await db.from("profiles").select("id, access_role, role");
  const userIds = (people ?? []).filter((p) => p.access_role === "director" || p.role === "Project Manager").map((p) => p.id);
  const { data: subs } = await db.from("push_subscriptions").select("*").in("user_id", userIds);
  const payload = JSON.stringify({ title, body, senderId: "upwork-night", url: "/quan-tri/upwork", tag: "upwork" });
  let sent = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { urgency: "high", TTL: 60 * 60 * 12 });
      sent++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
    }
  }
  return { recipients: userIds.length, devices: sent };
}

async function leadsOf(batchIds) {
  if (!batchIds.length) return [];
  const r = await db.from("upwork_leads").select("recommendation").in("batch_id", batchIds);
  return r.data ?? [];
}

// Daytime: one push the moment a check finds work, nothing when it doesn't.
async function notifyBatch(batchId, { quiet = false } = {}) {
  if (!batchId) fail("Thiếu batchId (lấy từ kết quả lệnh report).");
  const leads = await leadsOf([batchId]);
  let result;
  if (!leads.length) {
    result = { skipped: "không có job mới hợp SOP — không gửi thông báo" };
  } else {
    const strong = leads.filter((l) => l.recommendation === "strong").length;
    const body = `${leads.length} job mới hợp SOP${strong ? ` (${strong} rất hợp)` : ""} · proposal đã soạn sẵn — vào duyệt và gửi sớm nhé`;
    result = { body, ...(await push("🎯 Upwork: có job mới", body)) };
  }
  if (!quiet) console.log(JSON.stringify(result));
  return result;
}

// 07:00: one summary of the quiet hours (22:00 the evening before → now).
async function notifyNight({ quiet = false } = {}) {
  const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
  const todayVnMidnightUtc = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()) - 7 * 3600 * 1000;
  const since = new Date(todayVnMidnightUtc - 2 * 3600 * 1000).toISOString();
  const { data: batches } = await db.from("upwork_batches").select("id, jobs_found, note").gte("ran_at", since);
  const leads = await leadsOf((batches ?? []).map((b) => b.id));
  const seen = (batches ?? []).reduce((s, b) => s + (b.jobs_found ?? 0), 0);
  const strong = leads.filter((l) => l.recommendation === "strong").length;
  const problem = (batches ?? []).map((b) => b.note ?? "").find((n) => /chưa kết nối|lỗi|không đọc được/i.test(n));
  const body = problem
    ? `Có sự cố: ${problem.slice(0, 120)}`
    : leads.length
      ? `Đêm qua: ${seen} job mới · ${leads.length} job hợp${strong ? ` (${strong} rất hợp)` : ""} · đã soạn ${leads.length} proposal — vào duyệt nhé`
      : `Đêm qua: ${seen} job mới, không có job nào hợp SOP.`;
  const result = { body, ...(await push("🎯 Upwork: tổng kết đêm qua", body)) };
  if (!quiet) console.log(JSON.stringify(result));
  return result;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "context") await context();
else if (cmd === "report") await report(arg);
else if (cmd === "notify-batch") await notifyBatch(arg);
else if (cmd === "notify-night" || cmd === "notify") await notifyNight();
else fail("Dùng: node scripts/upwork-night.mjs context | report [file.json] | notify-batch <batchId> | notify-night");
