import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";

// Simple rate-limit: track recent attempts in memory (resets on cold start).
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const hash = process.env.PRIVATE_ZONE_PIN_HASH;
  if (!hash) {
    // No PIN configured — private zone is open (dev / not-yet-configured state).
    return NextResponse.json({ ok: true, unconfigured: true });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "Too many attempts" }, { status: 429 });
  }

  let pin: string;
  try {
    const body = await req.json() as { pin?: unknown };
    pin = String(body.pin ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  if (!pin) {
    return NextResponse.json({ ok: false, error: "PIN required" }, { status: 400 });
  }

  const valid = await verifyPassword(pin, hash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "Incorrect PIN" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
