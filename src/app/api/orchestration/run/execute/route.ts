import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import {
  ORCHESTRATION_ADAPTER_IDS,
  ORCHESTRATION_TASK_INTENT_IDS,
  type OrchestrationTaskRequest,
} from "@/lib/orchestration";
import { executeOpenClawRun } from "@/lib/orchestration/run-openclaw-execution";

const ExecuteOrchestrationBody = z.object({
  runId: z.string().uuid(),
  request: z.object({
    projectKey: z.string(),
    projectPath: z.string(),
    adapter: z.enum(ORCHESTRATION_ADAPTER_IDS),
    intent: z.enum(ORCHESTRATION_TASK_INTENT_IDS),
    model: z.string().optional(),
    customInstructions: z.string().optional(),
  }),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, ExecuteOrchestrationBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { runId, request } = dataOrResp as { runId: string; request: OrchestrationTaskRequest };

  try {
    const result = await executeOpenClawRun(runId, request);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Run failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, summary: result.summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Run crashed" },
      { status: 500 },
    );
  }
}
