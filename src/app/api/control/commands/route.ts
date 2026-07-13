import { type NextRequest, NextResponse } from "next/server";
import { claimNextPendingCommand } from "@/db/queries/pending-commands";
import { getApiUserId } from "@/lib/session";
import { RUNNER_LONG_POLL_MS } from "@/lib/constants/runner";
import type { RunnerChannel } from "@/db/schema/pending-commands";

// Runner polls this to claim the next pending command.
// Auth: Bearer (env token or ck_* agent token) OR browser session.
// ?wait=N (seconds, max RUNNER_LONG_POLL_SECONDS): long-poll — holds until a
// command arrives or wait expires. Cap lives in @/lib/constants/runner so the
// desktop poller's request shape and this server-side ceiling can't drift.
export async function GET(request: NextRequest) {
  // Resolve the user once. getApiUserId does the cookie session FIRST — via
  // resolveSessionUserId, which recovers an orphaned JWT (valid token, no user
  // row after a reseed) by verified email instead of polling under a dangling id
  // — THEN falls back to the runner's Bearer token. Per-user either way: a token
  // must never claim another account's commands, even on a shared host.
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userIds = [userId];

  const types = request.nextUrl.searchParams.get("types")
    ?.split(",")
    .map((type) => type.trim())
    .filter(Boolean);
  const channelParam = request.nextUrl.searchParams.get("channel");
  const runnerChannel: RunnerChannel | undefined =
    channelParam === "cloud" || channelParam === "local" ? channelParam : undefined;

  // Long-poll: hold the request until a command arrives or the wait expires.
  const waitMs = Math.min(
    parseInt(request.nextUrl.searchParams.get("wait") ?? "0", 10) * 1000,
    RUNNER_LONG_POLL_MS,
  );
  if (waitMs > 0) {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline && !request.signal.aborted) {
      const command = await claimNextPendingCommand(userIds, types, runnerChannel);
      if (command) return NextResponse.json({ command });
      await new Promise<void>((res) => setTimeout(res, 100));
    }
    return NextResponse.json({ command: null });
  }

  const command = await claimNextPendingCommand(userIds, types, runnerChannel);
  return NextResponse.json({ command: command ?? null });
}
