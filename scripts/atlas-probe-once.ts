// TEMPORARY ops runner (deleted after use): same work as POST /api/atlas/refresh.
import { db } from "../src/db";
import { userProjects } from "../src/db/schema";
import { getProbeTargets, saveSiteSnapshot } from "../src/db/queries/atlas";
import { probeSite } from "../src/lib/atlas/probe";

async function main() {
  const owners = await db.selectDistinct({ userId: userProjects.userId }).from(userProjects);
  for (const { userId } of owners) {
    const targets = await getProbeTargets(userId);
    if (!targets.length) continue;
    for (const t of targets) {
      const p = await probeSite(t.liveUrl);
      await saveSiteSnapshot(userId, t.id, p);
      console.log(
        `${p.ok ? "UP  " : "DOWN"} ${String(p.statusCode)} pages=${String(p.internalPaths.length).padStart(3)} ${t.liveUrl}`,
      );
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
