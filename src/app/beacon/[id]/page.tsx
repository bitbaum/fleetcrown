import { execSync } from "child_process";
import { readBeaconSession } from "@/app/api/beacon/route";
import { BeaconPageClient, BeaconLoading } from "./BeaconClient";
import { isRuntimeAvailable } from "@/lib/runtime";
import { parseProjectsConf } from "@/lib/agent-config";

// Reads the beacon session from the filesystem on the server, so the initial
// page render includes the full session content without any client-side API call.
export default async function BeaconPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readBeaconSession(id);

  if (!session) {
    return <BeaconLoading />;
  }

  // Enrich with git branch when running locally — server has filesystem access.
  let gitBranch: string | null = null;
  if (isRuntimeAvailable() && !session.gitBranch) {
    try {
      const projects = parseProjectsConf();
      const match = projects.find((p) => p.tab.toLowerCase() === session.project.toLowerCase());
      if (match) {
        gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: match.dir,
          encoding: "utf-8",
          timeout: 2000,
        }).trim() || null;
      }
    } catch { /* not a git repo or dir not found */ }
  }

  return <BeaconPageClient initialSession={{ ...session, gitBranch: session.gitBranch ?? gitBranch }} />;
}
