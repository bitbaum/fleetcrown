import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getPasswordReset, consumePasswordReset } from "@/db/queries/passwordResets";
import { hashPassword } from "@/lib/password";
import { updateUserPasswordHash } from "@/db/queries/users";

const Body = z.object({
  token:    z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { token, password } = dataOrResp;

  const reset = await getPasswordReset(token);
  if (!reset) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  const consumed = await consumePasswordReset(token);
  if (!consumed) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  await updateUserPasswordHash(reset.userId, passwordHash);

  return NextResponse.json({ ok: true });
}
