import { Resend } from "resend";
import { ROUTES } from "@/config/auth";
import { APP_NAME, APP_EMAIL_FROM, APP_TAGLINE } from "@/config/brand";

// Lazy — Resend throws at construction if key is empty string, which breaks next build
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

const FROM = process.env.EMAIL_FROM ?? APP_EMAIL_FROM;

export function appUrl(): string {
  return process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

// Fire-and-forget — callers don't await
export function sendEmailFire(to: string, subject: string, html: string, text: string): void {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] no RESEND_API_KEY — skipping send");
    console.log(`  To: ${to}\n  Subject: ${subject}\n  Text: ${text}`);
    return;
  }
  getResend().emails.send({ from: FROM, to, subject, html, text }).catch((err) => {
    console.error("[email] send error:", err);
  });
}

// Awaitable version for flows that need to know the email was accepted
export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] no RESEND_API_KEY — skipping send");
    return;
  }
  const { error } = await getResend().emails.send({ from: FROM, to, subject, html, text });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

// ─── Shared HTML shell ────────────────────────────────────────────────────────

function emailShell(content: string): string {
  const url = appUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#09090b;padding:20px 32px;border-radius:12px 12px 0 0;text-align:center;">
          <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;">⚡ ${APP_NAME}</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#ffffff;padding:40px 32px;border-radius:0 0 12px 12px;color:#09090b;">
          ${content}
        </td></tr>
      </table>
      <!-- Footer -->
      <table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;margin-top:20px;">
        <tr><td style="text-align:center;color:#71717a;font-size:12px;line-height:1.6;">
          ${APP_NAME} &mdash; ${APP_TAGLINE}<br>
          <a href="${url}" style="color:#71717a;text-decoration:underline;">${url.replace(/^https?:\/\//, "")}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#09090b;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;margin:24px 0;">${label}</a>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151;">${text}</p>`;
}

function small(text: string): string {
  return `<p style="margin:24px 0 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">${text}</p>`;
}

// ─── Templates ───────────────────────────────────────────────────────────────

export function verifyEmailTemplate(verifyUrl: string, name: string) {
  const subject = `Verify your ${APP_NAME} email`;
  const html = emailShell(`
    <h2 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#09090b;">Verify your email</h2>
    ${p(`Hi ${name}, welcome to ${APP_NAME}. Click the button below to verify your email address and activate your account.`)}
    <div style="text-align:center;">${btn(verifyUrl, "Verify email →")}</div>
    ${small(`Or paste this link in your browser:<br><a href="${verifyUrl}" style="color:#6b7280;word-break:break-all;">${verifyUrl}</a>`)}
    ${small(`This link expires in 24 hours. If you didn't create a ${APP_NAME} account, you can safely ignore this email.`)}
  `);
  const text = `Hi ${name}, verify your ${APP_NAME} email:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`;
  return { subject, html, text };
}

export function welcomeEmailTemplate(name: string) {
  const url = appUrl();
  const subject = `Welcome to ${APP_NAME}`;
  const html = emailShell(`
    <h2 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#09090b;">You're in, ${name} ⚡</h2>
    ${p(`${APP_NAME} is your command center for everything that matters — projects, goals, habits, people, money, and AI agents.`)}
    ${p("Here's what to do first:")}
    <ul style="margin:0 0 16px 0;padding-left:20px;color:#374151;font-size:15px;line-height:1.8;">
      <li>Add your projects and connect GitHub</li>
      <li>Set up your daily habits and goals</li>
      <li>Dispatch your first AI agent from the Control panel</li>
    </ul>
    <div style="text-align:center;">${btn(url + ROUTES.APP_HOME, `Open ${APP_NAME} →`)}</div>
    ${small("Questions? Reply to this email — we read everything.")}
  `);
  const text = `Welcome to ${APP_NAME}, ${name}!\n\nOpen your dashboard: ${url}${ROUTES.APP_HOME}`;
  return { subject, html, text };
}

export function resetPasswordEmailTemplate(resetUrl: string) {
  const subject = `Reset your ${APP_NAME} password`;
  const html = emailShell(`
    <h2 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#09090b;">Reset your password</h2>
    ${p(`Someone requested a password reset for your ${APP_NAME} account. Click the button below to set a new password.`)}
    <div style="text-align:center;">${btn(resetUrl, "Reset password →")}</div>
    ${small(`Or paste this link in your browser:<br><a href="${resetUrl}" style="color:#6b7280;word-break:break-all;">${resetUrl}</a>`)}
    ${small("This link expires in 2 hours. If you didn't request this, you can safely ignore this email — your password won't change.")}
  `);
  const text = `Reset your ${APP_NAME} password:\n\n${resetUrl}\n\nThis link expires in 2 hours. If you didn't request this, ignore it.`;
  return { subject, html, text };
}

// ─── Activity digest ────────────────────────────────────────────────────────

// Render the Groq-produced digest markdown into the shared email shell.
// Same paragraphs/bullets/headings/bold subset MarkdownText renders in the UI
// so the email and the on-screen report stay visually consistent.
function renderDigestMarkdown(markdown: string): string {
  const blocks: string[] = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      blocks.push("</ul>");
      listOpen = false;
    }
  };
  const inline = (text: string) =>
    text.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#09090b;">$1</strong>');
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { closeList(); continue; }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!listOpen) {
        blocks.push('<ul style="margin:0 0 16px 0;padding-left:20px;color:#374151;font-size:15px;line-height:1.7;">');
        listOpen = true;
      }
      blocks.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (/^#{1,3} /.test(line)) {
      closeList();
      blocks.push(`<h3 style="margin:20px 0 8px 0;font-size:16px;font-weight:600;color:#09090b;">${inline(line.replace(/^#+\s+/, ""))}</h3>`);
    } else {
      closeList();
      blocks.push(`<p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#374151;">${inline(line)}</p>`);
    }
  }
  closeList();
  return blocks.join("\n");
}

export function digestEmailTemplate({
  markdown,
  cadenceLabel,
  windowLabel,
  activityUrl,
}: {
  markdown: string;
  cadenceLabel: string; // "daily" | "weekly" | "monthly"
  windowLabel: string;  // "the last 24 hours" / "the last 7 days" / "the last 30 days"
  activityUrl: string;
}) {
  const subject = `${APP_NAME} ${cadenceLabel} digest`;
  const html = emailShell(`
    <h2 style="margin:0 0 4px 0;font-size:22px;font-weight:700;color:#09090b;">${cadenceLabel.charAt(0).toUpperCase() + cadenceLabel.slice(1)} digest</h2>
    ${p(`What your fleet did in ${windowLabel}.`)}
    ${renderDigestMarkdown(markdown)}
    <div style="text-align:center;">${btn(activityUrl, "Open Activity →")}</div>
    ${small(`You're receiving this because you opted in to ${cadenceLabel} digests in your ${APP_NAME} notification preferences.`)}
  `);
  const text = `${APP_NAME} ${cadenceLabel} digest — what your fleet did in ${windowLabel}.\n\n${markdown}\n\nOpen Activity: ${activityUrl}`;
  return { subject, html, text };
}
