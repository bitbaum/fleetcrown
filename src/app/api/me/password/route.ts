import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getUserById, updateUserPasswordHash } from "@/db/queries/users";
import { hashPassword, verifyPassword } from "@/lib/password";

const Body = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
});

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { currentPassword, newPassword } = dataOrResp;

  const user = await getUserById(userId);
  if (!user?.passwordHash) {
    return NextResponse.json(
      { error: "No password on this account — sign in with GitHub." },
      { status: 400 },
    );
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await updateUserPasswordHash(userId, passwordHash);

  return NextResponse.json({ ok: true });
}
