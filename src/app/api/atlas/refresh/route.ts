import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getProbeTargets, saveSiteSnapshot } from "@/db/queries/atlas";
import { probeSite } from "@/lib/atlas/probe";

/** Probing ~20 sites serially would take a minute; unbounded would hammer the
 *  one box that hosts most of them. Six at a time is polite and fast enough. */
const CONCURRENCY = 6;

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const targets = await getProbeTargets(userId);
  if (targets.length === 0) {
    return NextResponse.json({ ok: true, probed: 0, up: 0, down: 0 });
  }

  let up = 0;
  let down = 0;
  const queue = [...targets];

  async function worker() {
    for (;;) {
      const target = queue.shift();
      if (!target) return;
      const probe = await probeSite(target.liveUrl);
      // Persist per site rather than in one batch at the end: a single hung
      // site must not discard the observations already gathered.
      await saveSiteSnapshot(userId!, target.id, probe);
      if (probe.ok) up++;
      else down++;
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  return NextResponse.json({ ok: true, probed: targets.length, up, down });
}
