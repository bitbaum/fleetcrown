import { getSessionUserId } from "@/lib/session";
import { readLatestPendingSession } from "@/app/api/beacon/route";
import { BeaconLiveClient } from "./BeaconLiveClient";

export const dynamic = "force-dynamic";

export default async function BeaconLivePage() {
  // Async + user-scoped after the Change 4 DB migration. The file-based
  // version was userId-agnostic (it scanned /tmp for any pending row); the
  // DB version is properly per-user, so unauthenticated visitors render
  // the "no pending" state instead of leaking another user's popup.
  const userId = await getSessionUserId();
  const initial = userId ? await readLatestPendingSession(userId) : null;
  return <BeaconLiveClient initialSession={initial} />;
}
