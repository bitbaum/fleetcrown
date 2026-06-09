import { getSessionUserId } from "@/lib/session";
import { readLatestPendingSession } from "@/app/api/beacon/route";
import { BeaconLiveClient } from "./BeaconLiveClient";
import { isRuntimeAvailable } from "@/lib/runtime";
import { getDefaultUser } from "@/db/queries/users";

export const dynamic = "force-dynamic";

export default async function BeaconLivePage() {
  // Cookie-scoped in cloud. On the local runtime, the pre-warmed beacon window
  // uses an isolated browser profile and may not have the user's auth cookie,
  // so fall back to the local default user only on that machine.
  const sessionUserId = await getSessionUserId();
  const defaultUser = !sessionUserId && isRuntimeAvailable() ? await getDefaultUser() : null;
  const userId = sessionUserId ?? defaultUser?.id ?? null;
  const initial = userId ? await readLatestPendingSession(userId) : null;
  return <BeaconLiveClient initialSession={initial} />;
}
