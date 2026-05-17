import { readBeaconSession } from "@/app/api/beacon/route";
import { BeaconPageClient, BeaconLoading } from "./BeaconClient";

// Reads the beacon session from the filesystem on the server, so the initial
// page render includes the full session content without any client-side API call.
// This means the beacon page works even when the browser does not have a Cockpit
// session cookie — the PATCH for recording the user's choice still needs auth,
// but that always succeeds because beacon.py opens the browser the user is
// already logged in to (Brave, sorted first in the candidate list).
export default async function BeaconPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = readBeaconSession(id);

  if (!session) {
    return <BeaconLoading />;
  }

  return <BeaconPageClient initialSession={session} />;
}
