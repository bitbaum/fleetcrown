import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getUserByEmail } from "@/db/queries/users";
import { createEmailVerificationToken } from "@/db/queries/emailVerification";
import { sendEmailFire, verifyEmailTemplate } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const Body = z.object({
  email: z.string().trim().email().toLowerCase(),
});

const LIMIT  = 5;
const WINDOW = 15 * 60_000; // per 15 minutes

function appUrl(): string {
  return process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`resend-verify:${getClientIp(req)}`, LIMIT, WINDOW)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { email } = dataOrResp;

  // Always return 200 — don't reveal whether the account exists
  const user = await getUserByEmail(email);
  if (!user || user.emailVerified) return NextResponse.json({ ok: true });

  try {
    const token = await createEmailVerificationToken(user.id);
    const verifyUrl = `${appUrl()}/verify-email/${token}`;
    const { subject, html, text } = verifyEmailTemplate(verifyUrl, user.name ?? email.split("@")[0]);
    sendEmailFire(email, subject, html, text);
  } catch (err) {
    console.error("[resend-verification] error:", err);
  }

  return NextResponse.json({ ok: true });
}
