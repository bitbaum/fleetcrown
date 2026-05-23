import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getUserById, updateUser } from "@/db/queries/users";
import { isTeamInvitee } from "@/db/queries/orgs";
import { getRuntimeSnapshot } from "@/db/queries/runtime-snapshots";
import { getProjectStatesByUserId } from "@/db/queries/project-states";
import { isRuntimeAvailable } from "@/lib/runtime";
import { hasValidUsername, isOnboardingComplete, suggestUsername } from "@/lib/onboarding";

async function getDaemonConnectionStatus(userId: string) {
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

  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [teamInvitee, daemon] = await Promise.all([
    isTeamInvitee(userId),
    isRuntimeAvailable()
      ? Promise.resolve({ connected: true, live: true, lastPushedAt: new Date().toISOString() })
      : getDaemonConnectionStatus(userId),
  ]);

  return NextResponse.json({
    complete: isOnboardingComplete(user),
    username: user.username,
    suggestedUsername: suggestUsername(user.name, user.email),
    isTeamInvitee: teamInvitee,
    runtimeAvailable: isRuntimeAvailable(),
    daemonConnected: daemon.connected,
    daemonLive: daemon.live,
    daemonLastPushedAt: daemon.lastPushedAt,
  });
}

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!hasValidUsername(user.username)) {
    return NextResponse.json(
      { error: "Choose a username before finishing onboarding." },
      { status: 400 },
    );
  }

  if (isOnboardingComplete(user)) {
    return NextResponse.json({ ok: true, user });
  }

  const updated = await updateUser(userId, { onboardedAt: new Date() });
  return NextResponse.json({ ok: true, user: updated });
}
