import { readLatestPendingSession } from "@/app/api/beacon/route";
import { BeaconLiveClient } from "./BeaconLiveClient";

export const dynamic = "force-dynamic";

export default function BeaconLivePage() {
  return <BeaconLiveClient initialSession={readLatestPendingSession()} />;
}
