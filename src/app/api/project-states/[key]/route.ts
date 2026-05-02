import { NextResponse } from "next/server";
import { upsertProjectState } from "@/db/queries/project-states";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch = {
    projectKey:             key,
    tabName:                typeof body.tabName === "string" ? body.tabName : key,
    readyAt:                body.readyAt   ? new Date(body.readyAt   as string) : undefined,
    closingAt:              body.closingAt ? new Date(body.closingAt as string) : undefined,
    closedAt:               body.closedAt  ? new Date(body.closedAt  as string) : undefined,
    sessionDone:            typeof body.sessionDone    === "string" ? body.sessionDone    : undefined,
    sessionNext:            typeof body.sessionNext    === "string" ? body.sessionNext    : undefined,
    sessionTests:           typeof body.sessionTests   === "string" ? body.sessionTests   : undefined,
    sessionTodos:           typeof body.sessionTodos   === "string" ? body.sessionTodos   : undefined,
    sessionHealth:          typeof body.sessionHealth  === "string" ? body.sessionHealth  : undefined,
    currentPromptKey:       typeof body.currentPromptKey   === "string" ? body.currentPromptKey   : undefined,
    currentPromptLabel:     typeof body.currentPromptLabel === "string" ? body.currentPromptLabel : undefined,
    currentPromptStartedAt: body.currentPromptStartedAt
      ? new Date(body.currentPromptStartedAt as string)
      : undefined,
  };

  // Strip undefined fields so existing DB values aren't overwritten when not provided
  const filtered = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as typeof patch;

  try {
    const row = await upsertProjectState(filtered as Parameters<typeof upsertProjectState>[0]);
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
