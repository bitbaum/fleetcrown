import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getUserByEmail } from "@/db/queries/users";
import { createPasswordReset } from "@/db/queries/passwordResets";
import { sendEmail, resetPasswordEmailTemplate, appUrl } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const Body = z.object({
  email: z.string().trim().email().toLowerCase(),
});

const LIMIT  = 5;            // max reset requests
const WINDOW = 15 * 60_000; // per 15 minutes

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`forgot:${getClientIp(req)}`, LIMIT, WINDOW)) {
    return NextResponse.json(
      { error: "Too many password reset attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { email } = dataOrResp;

  // Always return 200 — don't reveal whether the email exists.
  const user = await getUserByEmail(email);
  if (!user) return NextResponse.json({ ok: true });

  // OAuth-created accounts do not initially have a password hash. Sending a
  // reset link to their stored email lets the account owner establish email
  // sign-in without creating a duplicate user row.
  const token = await createPasswordReset(user.id);
  const resetUrl = `${appUrl()}/reset-password/${token}`;

  try {
    const { subject, html, text } = resetPasswordEmailTemplate(resetUrl);
    await sendEmail(email, subject, html, text);
  } catch (err) {
    console.error("[forgot-password] email error:", err);
    // Don't expose email errors to the client
  }

  return NextResponse.json({ ok: true });
}
