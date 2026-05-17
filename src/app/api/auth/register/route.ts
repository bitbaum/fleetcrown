import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getUserByEmail, createUser } from "@/db/queries/users";
import { hashPassword } from "@/lib/password";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const Body = z.object({
  name:     z.string().trim().min(2, "Name must be at least 2 characters."),
  email:    z.string().trim().email("Invalid email address.").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const LIMIT  = 10;           // max registrations
const WINDOW = 60 * 60_000; // per hour

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`register:${getClientIp(req)}`, LIMIT, WINDOW)) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { name, email, password } = dataOrResp;

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({ name, email, passwordHash });

  return NextResponse.json({ ok: true, userId: user.id }, { status: 201 });
}
