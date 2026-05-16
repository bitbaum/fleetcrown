/**
 * Minimal email helper. Uses Resend REST API when RESEND_API_KEY is set.
 * Falls back to logging the link to the server console (dev/self-hosted without email config).
 */
export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Cockpit <noreply@cockpit.app>";

  if (!apiKey) {
    console.log("[email] RESEND_API_KEY not set — logging instead:");
    console.log(`  To: ${payload.to}`);
    console.log(`  Subject: ${payload.subject}`);
    console.log(`  Body: ${payload.text}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: payload.to, subject: payload.subject, html: payload.html, text: payload.text }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

export function resetPasswordEmail(resetUrl: string): Pick<EmailPayload, "subject" | "html" | "text"> {
  return {
    subject: "Reset your Cockpit password",
    text: `Reset your Cockpit password by visiting:\n\n${resetUrl}\n\nThis link expires in 2 hours. If you didn't request this, ignore it.`,
    html: `<p>Reset your Cockpit password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 2 hours. If you didn't request this, ignore it.</p>`,
  };
}
