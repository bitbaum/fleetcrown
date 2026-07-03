import { NextRequest, NextResponse } from "next/server";
import { persistProjectRuntimeIfNewer } from "@/db/queries/project-states";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";

const PatchBody = z.object({
  tabName:                z.string().optional(),
  workspaceId:            z.string().optional(),
  readyAt:                z.string().datetime().optional(),
  closingAt:              z.string().datetime().optional(),
  closedAt:               z.string().datetime().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(request, PatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const d = dataOrResp;
  const timestampValues = [d.readyAt, d.closingAt, d.closedAt].filter((value): value is string => value !== undefined);
  if (timestampValues.length === 0) {
    return NextResponse.json({ error: "A lifecycle timestamp is required" }, { status: 400 });
  }
  const runtimeObservedAt = new Date(Math.max(...timestampValues.map((value) => new Date(value).getTime())));
  const patch = Object.fromEntries(
    Object.entries({
      projectKey:             key,
      userId,
      workspaceId:            d.workspaceId?.trim() || undefined,
      tabName:                d.tabName ?? key,
      runtimeObservedAt,
      readyAt:                d.readyAt                ? new Date(d.readyAt)                : undefined,
      closingAt:              d.closingAt              ? new Date(d.closingAt)              : undefined,
      closedAt:               d.closedAt               ? new Date(d.closedAt)               : undefined,
    }).filter(([, v]) => v !== undefined),
  );

  try {
    const row = await persistProjectRuntimeIfNewer(patch as unknown as Parameters<typeof persistProjectRuntimeIfNewer>[0]);
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
