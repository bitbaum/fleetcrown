import { NextRequest, NextResponse } from "next/server";
import { upsertProjectState } from "@/db/queries/project-states";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";

const PatchBody = z.object({
  tabName:                z.string().optional(),
  readyAt:                z.string().datetime().optional(),
  closingAt:              z.string().datetime().optional(),
  closedAt:               z.string().datetime().optional(),
  sessionStatus:          z.string().optional(),
  sessionDone:            z.string().optional(),
  sessionNext:            z.string().optional(),
  sessionTests:           z.string().optional(),
  sessionTodos:           z.string().optional(),
  sessionHealth:          z.string().optional(),
  currentPromptKey:       z.string().optional(),
  currentPromptLabel:     z.string().optional(),
  currentPromptStartedAt: z.string().datetime().optional(),
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
  const patch = Object.fromEntries(
    Object.entries({
      projectKey:             key,
      userId,
      tabName:                d.tabName ?? key,
      readyAt:                d.readyAt                ? new Date(d.readyAt)                : undefined,
      closingAt:              d.closingAt              ? new Date(d.closingAt)              : undefined,
      closedAt:               d.closedAt               ? new Date(d.closedAt)               : undefined,
      sessionStatus:          d.sessionStatus,
      sessionDone:            d.sessionDone,
      sessionNext:            d.sessionNext,
      sessionTests:           d.sessionTests,
      sessionTodos:           d.sessionTodos,
      sessionHealth:          d.sessionHealth,
      currentPromptKey:       d.currentPromptKey,
      currentPromptLabel:     d.currentPromptLabel,
      currentPromptStartedAt: d.currentPromptStartedAt ? new Date(d.currentPromptStartedAt) : undefined,
    }).filter(([, v]) => v !== undefined),
  );

  try {
    const row = await upsertProjectState(patch as unknown as Parameters<typeof upsertProjectState>[0]);
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
