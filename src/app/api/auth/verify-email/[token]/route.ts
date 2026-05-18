import { NextRequest, NextResponse } from "next/server";
import { consumeEmailVerificationToken } from "@/db/queries/emailVerification";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const userId = await consumeEmailVerificationToken(token);

  if (!userId) {
    return NextResponse.redirect(new URL("/verify-email?error=invalid", _req.url));
  }

  return NextResponse.redirect(new URL("/verify-email?success=1", _req.url));
}
