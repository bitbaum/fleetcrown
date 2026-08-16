import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getUserById, updateUser } from "@/db/queries/users";
import { toClientUser } from "@/lib/user-client-view";
import { isTeamInvitee } from "@/db/queries/orgs";
import { getRuntimeSnapshot } from "@/db/queries/runtime-snapshots";
import { getProjectStatesByUserId } from "@/db/queries/project-states";
import { isRuntimeAvailable } from "@/lib/runtime";
import { hasValidUsername, isOnboardingComplete, suggestUsername } from "@/lib/onboarding";
import { healReturningUserOnboarding } from "@/lib/onboarding-heal";
import { countActiveProjects } from "@/db/queries/user-projects";

async function getRunnerConnectionStatus(userId: string) {
  const [snapshot, states] = await Promise.all([
    getRuntimeSnapshot(userId).catch(() => null),
    getProjectStatesByUserId(userId).catch(() => []),
  ]);

  let lastAt: Date | null = snapshot?.updatedAt ?? null;
  for (const row of states) {
    if (!lastAt || row.updatedAt > lastAt) lastAt = row.updatedAt;
  }

  const lastPushedAt = lastAt?.toISOString() ?? null;
  const connected = lastAt != null;
  const live = lastAt != null && Date.now() - lastAt.getTime() < 90_000;

  return { connected, live, lastPushedAt };
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  user = await healReturningUserOnboarding(user);

  const [teamInvitee, runner, projectCount] = await Promise.all([
    isTeamInvitee(userId),
    isRuntimeAvailable()
      ? Promise.resolve({ connected: true, live: true, lastPushedAt: new Date().toISOString() })
      : getRunnerConnectionStatus(userId),
    countActiveProjects(userId),
  ]);

  const complete = isOnboardingComplete(user);

  return NextResponse.json({
    complete,
    username: user.username,
    suggestedUsername: suggestUsername(user.name, user.email),
    isTeamInvitee: teamInvitee,
    isReturningUser: projectCount > 0,
    projectCount,
    runtimeAvailable: isRuntimeAvailable(),
    runnerConnected: runner.connected,
    runnerLive: runner.live,
    runnerLastPushedAt: runner.lastPushedAt,
    /** Client should call session.update() when true so middleware JWT catches up. */
    needsSessionRefresh: complete,
  });
}

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  user = await healReturningUserOnboarding(user);

  if (!hasValidUsername(user.username)) {
    return NextResponse.json(
      { error: "Choose a username before finishing onboarding." },
      { status: 400 },
    );
  }

  if (isOnboardingComplete(user)) {
    return NextResponse.json({ ok: true, user: toClientUser(user) });
  }

  const updated = await updateUser(userId, { onboardedAt: new Date() });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, user: toClientUser(updated) });
}
