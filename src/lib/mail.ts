import nodemailer from "nodemailer";
import { MONTH_LABELS } from "@/lib/constants/attendance";
import type { FileAttachment, PayrollItem } from "@/lib/types";

// Gmail SMTP using the studio's existing Gmail account — GMAIL_USER is the
// full address, GMAIL_APP_PASSWORD is a 16-character Google "App Password"
// (requires 2-Step Verification), not the normal account password.
function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export function mailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export async function sendStaffWelcomeEmail(input: {
  to: string;
  displayName: string;
  password: string;
}) {
  const transporter = getTransporter();
  // No SMTP credentials configured yet — skip silently, account creation
  // itself must never fail because of this.
  if (!transporter) return;

  const loginUrl = "https://funtikidbooks.com/dang-nhap";

  await transporter.sendMail({
    from: `"Funti Kidbooks Studio" <${process.env.GMAIL_USER}>`,
    to: input.to,
    subject: "Tài khoản không gian làm việc Funti Kidbooks Studio",
    text: `Chào ${input.displayName},

Bạn vừa được cấp một tài khoản để truy cập không gian làm việc của Funti Kidbooks Studio.

Email đăng nhập: ${input.to}
Mật khẩu: ${input.password}

Đăng nhập tại: ${loginUrl}

Vì lý do bảo mật, bạn nên đổi mật khẩu sau khi đăng nhập lần đầu.

Thân mến,
Funti Kidbooks Studio`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #2b2622;">
        <h2 style="margin-bottom: 4px;">Chào ${input.displayName},</h2>
        <p>Bạn vừa được cấp một tài khoản để truy cập không gian làm việc của <strong>Funti Kidbooks Studio</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px 0; color: #78776f;">Email đăng nhập</td>
            <td style="padding: 8px 0; font-weight: bold;">${input.to}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #78776f;">Mật khẩu</td>
            <td style="padding: 8px 0; font-weight: bold;">${input.password}</td>
          </tr>
        </table>
        <p>
          <a href="${loginUrl}" style="display: inline-block; background: #e8674a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
            Đăng nhập ngay
          </a>
        </p>
        <p style="font-size: 13px; color: #78776f;">Vì lý do bảo mật, bạn nên đổi mật khẩu sau khi đăng nhập lần đầu.</p>
        <p style="margin-top: 24px;">Thân mến,<br />Funti Kidbooks Studio</p>
      </div>
    `,
  });
}

// Fallback for the "chat with us" widget's push notification — push only
// reaches a device that already granted permission, so this covers the
// case where no director/admin has one set up (or it's silently expired)
// and a customer message would otherwise go unseen until someone happens
// to open the Khách hàng inbox.
// Anything a customer typed goes into these emails as text, never as HTML.
function esc(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export async function sendNewVisitorMessageEmail(input: {
  to: string;
  visitorName: string | null;
  visitorEmail: string | null;
  preview: string;
}) {
  const transporter = getTransporter();
  if (!transporter) return;

  const chatUrl = "https://funtikidbooks.com/workspace/khach-hang";
  const who = input.visitorName?.trim() || "Khách vãng lai";

  await transporter.sendMail({
    from: `"Funti Kidbooks Studio" <${process.env.GMAIL_USER}>`,
    to: input.to,
    subject: `🔔 Khách hàng nhắn tin mới — ${who}`,
    text: `${who}${input.visitorEmail ? ` (${input.visitorEmail})` : ""} vừa nhắn:

"${input.preview}"

Trả lời tại: ${chatUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #2b2622;">
        <h2 style="margin-bottom: 4px;">Tin nhắn mới từ ${esc(who)}</h2>
        ${input.visitorEmail ? `<p style="color: #78776f; margin-top: 0;">Email khách: ${esc(input.visitorEmail)}</p>` : ""}
        <p style="background: #f4f1ea; border-radius: 8px; padding: 12px 14px; white-space: pre-wrap;">${esc(input.preview)}</p>
        <p>
          <a href="${chatUrl}" style="display: inline-block; background: #e8674a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
            Trả lời ngay
          </a>
        </p>
      </div>
    `,
  });
}

export type ReplyEmailPart = { content: string; imageUrls: string[]; files: FileAttachment[] };

const REPLY_EMAIL_TEXT = {
  vi: {
    subject: "Funti Kidbooks Studio đã trả lời bạn",
    hello: (name: string) => `Chào ${name},`,
    someone: "bạn",
    intro: "Funti Kidbooks Studio vừa trả lời tin nhắn của bạn:",
    moreImages: (n: number) => `+ ${n} ảnh nữa trong cuộc trò chuyện`,
    youWrote: "Bạn đã nhắn:",
    button: "Mở cuộc trò chuyện",
    afterButton: "Bấm nút để xem cả cuộc trò chuyện và nhắn tiếp cho Funti.",
    timezone: "",
    footer: {
      visitor: "Bạn nhận được email này vì đã để lại email trong khung chat trên funtikidbooks.com. Không muốn nhận nữa? Mở cuộc trò chuyện và bấm “Không nhận nữa”.",
      client: "Bạn nhận được email này vì có dự án với Funti Kidbooks Studio trên funtikidbooks.com.",
    },
  },
  en: {
    subject: "Funti Kidbooks Studio replied to your message",
    hello: (name: string) => `Hi ${name},`,
    someone: "there",
    intro: "Funti Kidbooks Studio has replied to your message:",
    moreImages: (n: number) => `+ ${n} more image${n > 1 ? "s" : ""} in the conversation`,
    youWrote: "You wrote:",
    button: "Continue the conversation",
    afterButton: "Open the chat to see the whole conversation and reply to us.",
    timezone: "We're a children's book studio in Vietnam (GMT+7), so our replies often arrive while it's night where you are.",
    footer: {
      visitor: "You're receiving this because you left your email in the chat on funtikidbooks.com. Don't want these emails? Open the chat and tap “Stop emails”.",
      client: "You're receiving this because you have a project with Funti Kidbooks Studio on funtikidbooks.com.",
    },
  },
};

const MAX_EMAIL_IMAGES = 6;

// The studio's answer, for a customer who wasn't on the site to see it
// (lib/replyEmails.ts). The whole reply, not a teaser — many customers
// will never click through — in the language the studio answered in.
// Throws when Gmail isn't set up or sending fails, so the caller can put
// the reply back in line for the next try.
export async function sendCustomerReplyEmail(input: {
  to: string;
  name: string | null;
  lang: "vi" | "en";
  kind: "visitor" | "client";
  replies: ReplyEmailPart[];
  youWrote: string | null;
  link: string;
}) {
  const transporter = getTransporter();
  if (!transporter) throw new Error("Gmail SMTP is not configured");

  const L = REPLY_EMAIL_TEXT[input.lang];
  const name = input.name?.trim() || L.someone;
  const images = input.replies.flatMap((r) => r.imageUrls);
  const shownImages = images.slice(0, MAX_EMAIL_IMAGES);
  const files = input.replies.flatMap((r) => r.files);
  const youWrote = input.youWrote?.trim() ? input.youWrote.trim() : null;
  const lines = (text: string) => esc(text).replace(/\r?\n/g, "<br />");

  const text = [
    L.hello(name),
    "",
    L.intro,
    "",
    ...input.replies.map((r) => r.content.trim()).filter(Boolean).flatMap((t) => [t, ""]),
    ...images.map((u) => `📷 ${u}`),
    ...(images.length ? [""] : []),
    ...files.map((f) => `📄 ${f.name}: ${f.url}`),
    ...(files.length ? [""] : []),
    ...(youWrote ? [`${L.youWrote} "${youWrote}"`, ""] : []),
    `${L.button}: ${input.link}`,
    "",
    ...(L.timezone ? [L.timezone, ""] : []),
    "Funti Kidbooks Studio",
    "",
    L.footer[input.kind],
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2622; font-size: 15px; line-height: 1.55;">
      <p style="margin: 0 0 6px; font-size: 17px; font-weight: bold;">${esc(L.hello(name))}</p>
      <p style="margin: 0 0 14px;">${esc(L.intro)}</p>
      ${input.replies
        .map((r) => r.content.trim())
        .filter(Boolean)
        .map(
          (t) =>
            `<div style="background: #f4f1ea; border-left: 4px solid #e8674a; border-radius: 8px; padding: 12px 14px; margin: 0 0 10px;">${lines(t)}</div>`,
        )
        .join("")}
      ${shownImages
        .map(
          (u) =>
            `<a href="${esc(u)}"><img src="${esc(u)}" alt="" style="display: block; max-width: 100%; height: auto; border-radius: 8px; margin: 0 0 10px;" /></a>`,
        )
        .join("")}
      ${images.length > shownImages.length ? `<p style="margin: 0 0 10px; color: #78776f; font-size: 13px;">${esc(L.moreImages(images.length - shownImages.length))}</p>` : ""}
      ${files.map((f) => `<p style="margin: 0 0 8px;">📄 <a href="${esc(f.url)}" style="color: #c4553a;">${esc(f.name)}</a></p>`).join("")}
      ${
        youWrote
          ? `<p style="margin: 16px 0 4px; color: #78776f; font-size: 13px;">${esc(L.youWrote)}</p>
             <p style="margin: 0 0 16px; color: #78776f; font-size: 13px; font-style: italic;">${lines(youWrote)}</p>`
          : ""
      }
      <p style="margin: 20px 0 6px;">
        <a href="${esc(input.link)}" style="display: inline-block; background: #e8674a; color: #fff; text-decoration: none; padding: 11px 22px; border-radius: 8px; font-weight: bold;">
          ${esc(L.button)}
        </a>
      </p>
      <p style="margin: 0 0 16px; color: #78776f; font-size: 13px;">${esc(L.afterButton)}</p>
      ${L.timezone ? `<p style="margin: 0 0 16px; color: #78776f; font-size: 13px;">${esc(L.timezone)}</p>` : ""}
      <p style="margin: 20px 0 0;">Funti Kidbooks Studio</p>
      <p style="margin: 16px 0 0; color: #a8a49b; font-size: 12px;">${esc(L.footer[input.kind])}</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Funti Kidbooks Studio" <${process.env.GMAIL_USER}>`,
    to: input.to,
    subject: L.subject,
    text,
    html,
  });
}

// Fallback for staff (director/PM) when a client submits a new project brief
// or sends a follow-up message — same reasoning as
// sendNewVisitorMessageEmail, just for the signed-in client portal instead
// of the anonymous widget.
export async function sendNewClientMessageEmail(input: { to: string; clientName: string | null; preview: string }) {
  const transporter = getTransporter();
  if (!transporter) return;

  const inboxUrl = "https://funtikidbooks.com/workspace/khach-hang";
  const who = input.clientName?.trim() || "Một khách hàng";

  await transporter.sendMail({
    from: `"Funti Kidbooks Studio" <${process.env.GMAIL_USER}>`,
    to: input.to,
    subject: `🔔 Khách hàng nhắn tin mới — ${who}`,
    text: `${who} vừa nhắn trong Công việc:

"${input.preview}"

Trả lời tại: ${inboxUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #2b2622;">
        <h2 style="margin-bottom: 4px;">Tin nhắn mới từ ${esc(who)}</h2>
        <p style="background: #f4f1ea; border-radius: 8px; padding: 12px 14px; white-space: pre-wrap;">${esc(input.preview)}</p>
        <p>
          <a href="${inboxUrl}" style="display: inline-block; background: #e8674a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
            Trả lời ngay
          </a>
        </p>
      </div>
    `,
  });
}

// The Liên hệ form used to notify nobody (28/10/2026) — entries just sat
// in Quản trị → Form liên hệ.
export async function sendContactFormEmail(input: {
  to: string;
  fullName: string;
  email: string;
  phone: string | null;
  projectType: string | null;
  message: string;
}) {
  const transporter = getTransporter();
  if (!transporter) return;
  const pageUrl = "https://funtikidbooks.com/quan-tri/tin-nhan";
  const details = [`Email: ${input.email}`, input.phone ? `Điện thoại: ${input.phone}` : "", input.projectType ? `Loại dự án: ${input.projectType}` : ""]
    .filter(Boolean)
    .join("\n");

  await transporter.sendMail({
    from: `"Funti Kidbooks Studio" <${process.env.GMAIL_USER}>`,
    to: input.to,
    replyTo: input.email,
    subject: `🟠 KHÁCH ĐIỀN FORM LIÊN HỆ — ${input.fullName}`,
    text: `${input.fullName} vừa gửi form Liên hệ:

"${input.message}"

${details}

Trả lời: bấm Reply email này (gửi thẳng cho khách), rồi đánh dấu "Đã trả lời" tại ${pageUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #2b2622;">
        <h2 style="margin-bottom: 4px;">Form Liên hệ mới từ ${esc(input.fullName)}</h2>
        <p style="color: #78776f; margin-top: 0; white-space: pre-wrap;">${esc(details)}</p>
        <p style="background: #f4f1ea; border-radius: 8px; padding: 12px 14px; white-space: pre-wrap;">${esc(input.message)}</p>
        <p style="color: #78776f;">Bấm <b>Reply</b> email này là gửi thẳng cho khách. Trả lời xong nhớ đánh dấu “Đã trả lời” trên web.</p>
        <p>
          <a href="${pageUrl}" style="display: inline-block; background: #e8674a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
            Mở form Liên hệ
          </a>
        </p>
      </div>
    `,
  });
}

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

// Mirrors PayrollPrintView.tsx's layout (same line items, same "Thực nhận"
// total) so the emailed notice and the printable PDF never show different
// numbers for the same payroll_records row.
export async function sendPayslipEmail(input: {
  to: string;
  displayName: string;
  month: string; // first-of-month date string, e.g. "2026-08-01"
  workDays: number | null;
  baseSalary: number;
  items: PayrollItem[];
  status: "draft" | "paid";
  note: string | null;
}) {
  const transporter = getTransporter();
  if (!transporter) return;

  const d = new Date(`${input.month}T00:00:00`);
  const monthLabel = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
  const total = input.baseSalary + input.items.reduce((sum, it) => sum + it.amount, 0);
  const statusLabel = input.status === "paid" ? "Đã trả" : "Đang xử lý";

  const itemRows = input.items
    .map(
      (it) => `
        <tr>
          <td style="padding: 6px 0; border-bottom: 1px solid #e5e0d8;">${it.label}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #e5e0d8; text-align: right; color: ${it.amount < 0 ? "#c0524f" : "#2b2622"};">
            ${it.amount < 0 ? "-" : "+"}${formatVnd(Math.abs(it.amount))}
          </td>
        </tr>`,
    )
    .join("");

  await transporter.sendMail({
    from: `"Funti Kidbooks Studio" <${process.env.GMAIL_USER}>`,
    to: input.to,
    subject: `Phiếu lương ${monthLabel} — Funti Kidbooks Studio`,
    text: `Chào ${input.displayName},

Đây là phiếu lương ${monthLabel} của bạn.

Lương theo ngày công${input.workDays !== null ? ` (${input.workDays} ngày)` : ""}: ${formatVnd(input.baseSalary)}
${input.items.map((it) => `${it.label}: ${it.amount < 0 ? "-" : "+"}${formatVnd(Math.abs(it.amount))}`).join("\n")}

Thực nhận: ${formatVnd(total)}
Trạng thái: ${statusLabel}
${input.note ? `\nGhi chú: ${input.note}` : ""}

Xem chi tiết trong không gian làm việc tại funtikidbooks.com.

Thân mến,
Funti Kidbooks Studio`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #2b2622;">
        <h2 style="margin-bottom: 4px;">Chào ${input.displayName},</h2>
        <p>Đây là phiếu lương <strong>${monthLabel}</strong> của bạn.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; border-bottom: 1px solid #e5e0d8;">
              Lương theo ngày công${input.workDays !== null ? ` (${input.workDays} ngày)` : ""}
            </td>
            <td style="padding: 6px 0; border-bottom: 1px solid #e5e0d8; text-align: right;">${formatVnd(input.baseSalary)}</td>
          </tr>
          ${itemRows}
          <tr>
            <td style="padding: 10px 0 2px; font-weight: bold; font-size: 16px;">Thực nhận</td>
            <td style="padding: 10px 0 2px; font-weight: bold; font-size: 16px; text-align: right;">${formatVnd(total)}</td>
          </tr>
        </table>
        <p style="font-size: 13px; color: #78776f;">Trạng thái: ${statusLabel}</p>
        ${input.note ? `<p style="font-size: 13px; color: #78776f;">Ghi chú: ${input.note}</p>` : ""}
        <p>
          <a href="https://funtikidbooks.com/workspace/cham-cong" style="display: inline-block; background: #e8674a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
            Xem trong không gian làm việc
          </a>
        </p>
        <p style="margin-top: 24px;">Thân mến,<br />Funti Kidbooks Studio</p>
      </div>
    `,
  });
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Thử việc → chính thức (Quản trị → Nhân sự). The body is whatever the
// director/PM left in the confirm dialog, so it's escaped and its line
// breaks kept. Returns false when Gmail SMTP isn't configured, so the UI
// can offer to open Gmail with the same letter instead.
export async function sendOfficialStaffEmail(input: { to: string; subject: string; message: string }): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  await transporter.sendMail({
    from: `"Funti Kidbooks Studio" <${process.env.GMAIL_USER}>`,
    to: input.to,
    subject: input.subject,
    text: input.message,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2b2622;">
        <p style="font-size: 28px; margin: 0 0 8px;">🎉</p>
        <div style="font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(input.message)}</div>
      </div>
    `,
  });
  return true;
}
