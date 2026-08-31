import nodemailer from "nodemailer";
import { MONTH_LABELS } from "@/lib/constants/attendance";
import type { PayrollItem } from "@/lib/types";

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
