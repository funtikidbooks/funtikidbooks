import nodemailer from "nodemailer";

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
