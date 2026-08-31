import { NextRequest, NextResponse } from "next/server";
import { getHumanTask } from "@/db/queries/human-tasks";
import { publishTaskToOrangeCat } from "@/lib/integrations/orangecat-human-task";
import { jsonOk, readIdParam } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { denyDemoInHandler } from "@/lib/demo-guard";

/**
 * Mirror a paid assignment into OrangeCat so the person can actually be paid.
 *
 * Opt-in per assignment, never automatic on create: publishing puts the title
 * and brief on another product's surface, and that is the operator's call to
 * make once they have written the thing, not a side effect of writing it.
 * A failure here is reported, not thrown — the assignment is unaffected either
 * way, which is the whole point of the fire-and-forget seam.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  // The rest of /api/crew only touches the caller's own rows, so the family is
  // demo-safe (see config/demo.ts). This one call leaves the tenant: it creates
  // a real listing on OrangeCat with the studio's integration key. A shared
  // public demo must not be able to do that.
  const demoDenied = await denyDemoInHandler(access.userId, "content");
  if (demoDenied) return demoDenied;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const task = await getHumanTask(access.userId, idOrResp);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (task.feeAmount === null) {
    return NextResponse.json(
      { error: "Set a fee before publishing to OrangeCat" },
      { status: 400 },
    );
  }

  const result = await publishTaskToOrangeCat(access.userId, task);
  return jsonOk({ result, task: await getHumanTask(access.userId, idOrResp) });
}
