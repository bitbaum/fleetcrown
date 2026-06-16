import { NextRequest, NextResponse } from "next/server";
import { isRuntimeAvailable } from "@/lib/runtime";
import { checkEnv, envHealthy } from "@/lib/env";

// force-dynamic: env read must happen at request time, not build time.
export const dynamic = "force-dynamic";

// Health + config gate. Returns 503 when the env sanity check finds a
// fatal/error issue, so the post-deploy assertion (and `npm run smoke`) go red
// instead of shipping a silently-broken auth/email config. Detailed issue
// messages are gated behind CRON_SECRET (the deploy has it); the public
// response is booleans only.
export async function GET(req: NextRequest) {
  const issues = checkEnv();
  const healthy = envHealthy(issues);
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authed = Boolean(cronSecret) && req.headers.get("authorization") === `Bearer ${cronSecret}`;

  return NextResponse.json(
    {
      ok: healthy,
      runtime: isRuntimeAvailable(),
      version: process.env.npm_package_version ?? null,
      env: {
        healthy,
        issueCount: issues.length,
        ...(authed ? { issues } : {}),
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
