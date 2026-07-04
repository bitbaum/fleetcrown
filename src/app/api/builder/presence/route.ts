import { NextResponse } from "next/server";
import { getBuilderPresence, getRunnerConnected } from "@/db/queries/runner-presence";
import { getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";

/** GET /api/builder/presence — minimal executor state for honesty chips. */
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runtimeAvailable = isRuntimeAvailable();
  if (runtimeAvailable) {
    return NextResponse.json({
      runtimeAvailable: true,
      runnerConnected: true,
      builderPresence: { cloud: false, local: true, any: true },
    });
  }

  const [builderPresence, runnerConnected] = await Promise.all([
    getBuilderPresence(userId).catch(() => ({ cloud: false, local: false, any: false })),
    getRunnerConnected(userId).catch(() => false),
  ]);

  return NextResponse.json({
    runtimeAvailable: false,
    runnerConnected: builderPresence.any ?? runnerConnected,
    builderPresence,
  });
}
