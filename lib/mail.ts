import nodemailer from "nodemailer";

/**
 * メール送信。社内ツールがメールなので、通知はすべてここを通す。
 *
 * SMTP の設定が無い、または MAIL_DRY_RUN=1 のときは送信せずログに出す。
 * 設定前でも画面と通知内容を確認できるようにするため。
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  cc?: string[];
}

export function isDryRun(): boolean {
  return process.env.MAIL_DRY_RUN === "1" || !process.env.SMTP_HOST;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const from = process.env.MAIL_FROM ?? "フェース タスク管理 <no-reply@example.co.jp>";
  if (isDryRun()) {
    console.log(
      [
        "─── [DRY RUN] 送信されるメール ───",
        `To: ${message.to}`,
        message.cc?.length ? `Cc: ${message.cc.join(", ")}` : "",
        `Subject: ${message.subject}`,
        "",
        message.text,
        "──────────────────────────────",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }
  await getTransporter().sendMail({
    from,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    text: message.text,
  });
}
