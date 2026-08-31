import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { enqueueAutoContinueCommand } from "@/db/queries/pending-commands";
import { APP_SLUG } from "@/config/brand";
import { writeFileSync, unlinkSync } from "fs";
import {
  getProjectState,
  getProjectStatesByUserId,
  setAllProjectAutoContinue,
  upsertProjectState,
} from "@/db/queries/project-states";
import { recordControlAuditEvent } from "@/db/queries/control-audit-events";
import { executionAccessErrorBody, resolveQueuedExecution } from "@/lib/execution-access";

const Body = z.object({
  tab: z.string().max(200).optional(),
  enabled: z.boolean(),
  all: z.boolean().optional(),
});

function sentinelPath(tab: string) {
  return `/tmp/${APP_SLUG}-auto-continue-${tab.toLowerCase()}`;
}

function applyLocalSentinel(tab: string, enabled: boolean) {
  if (enabled) {
    try {
      unlinkSync(sentinelPath(tab));
    } catch {
      /* absent */
    }
  } else {
    writeFileSync(sentinelPath(tab), "off", "utf8");
  }
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonBody(req, Body);
  if (body instanceof NextResponse) return body;
  const { tab, enabled, all } = body;

  if (all) {
    const rows = await setAllProjectAutoContinue(userId, enabled);
    recordControlAuditEvent({
      userId,
      event: "auto_continue",
      source: "api/control/auto-continue",
      action: enabled ? "resumed_all" : "paused_all",
      reason: enabled
        ? "Resumed automatic continuation for all projects"
        : "Paused automatic continuation for all projects",
      meta: { count: rows.length },
    });
    if (isRuntimeAvailable()) {
      for (const row of rows) applyLocalSentinel(row.projectKey, enabled);
      return NextResponse.json({ ok: true, mode: "local", scope: "all", count: rows.length });
    }
    const execution = await resolveQueuedExecution(userId, { defaultChannel: "cloud" });
    if (!execution.ok) {
      return NextResponse.json(executionAccessErrorBody(execution), { status: execution.status });
    }
    const commandIds = await Promise.all(
      rows.map((row) =>
        enqueueAutoContinueCommand(userId, {
          tab: row.tabName,
          ...(execution.channel ? { channel: execution.channel } : {}),
          enabled,
        }),
      ),
    );
    return NextResponse.json({
      ok: true,
      mode: "queued",
      scope: "all",
      count: commandIds.length,
      commandIds,
    });
  }

  if (!tab) return NextResponse.json({ error: "tab is required" }, { status: 400 });
  const key = tab.toLowerCase();

  await upsertProjectState({ userId, projectKey: key, tabName: tab, autoContinueEnabled: enabled });
  recordControlAuditEvent({
    userId,
    projectKey: key,
    tabName: tab,
    event: "auto_continue",
    source: "api/control/auto-continue",
    action: enabled ? "resumed" : "paused",
    reason: enabled
      ? "Resumed automatic continuation for project"
      : "Paused automatic continuation for project",
  });

  if (isRuntimeAvailable()) {
    applyLocalSentinel(key, enabled);
    return NextResponse.json({ ok: true, mode: "local" });
  }

  const execution = await resolveQueuedExecution(userId, { defaultChannel: "cloud" });
  if (!execution.ok) {
    return NextResponse.json(executionAccessErrorBody(execution), { status: execution.status });
  }
  const commandId = await enqueueAutoContinueCommand(userId, {
    tab,
    ...(execution.channel ? { channel: execution.channel } : {}),
    enabled,
  });
  return NextResponse.json({ ok: true, mode: "queued", commandId });
}

export async function GET(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tab = req.nextUrl.searchParams.get("tab")?.trim().toLowerCase();
  const all =
    req.nextUrl.searchParams.get("all") === "1" || req.nextUrl.searchParams.get("all") === "true";
  if (all) {
    const rows = await getProjectStatesByUserId(userId);
    const disabled = rows.filter((row) => !row.autoContinueEnabled).length;
    return NextResponse.json({
      enabled: rows.length === 0 ? true : disabled === 0,
      total: rows.length,
      disabled,
    });
  }
  if (!tab) return NextResponse.json({ error: "tab is required" }, { status: 400 });
  const row = await getProjectState(userId, tab);
  return NextResponse.json({ enabled: row?.autoContinueEnabled ?? true });
}
