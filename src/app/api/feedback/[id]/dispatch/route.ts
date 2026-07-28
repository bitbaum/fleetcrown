import { NextRequest, NextResponse } from "next/server";
import { readIdParam, readJsonBody, jsonError, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { getFeedbackWithProject, setFeedbackStatus } from "@/db/queries/site-feedback";
import { injectPrompt } from "@/lib/inject-core";
import { FEEDBACK_STATUS } from "@/lib/constants/statuses";
import type { SiteFeedback } from "@/db/schema";

/**
 * One-click "Dispatch fix": turn a visitor-feedback item into a scoped agent
 * run through the same injectPrompt SSOT every other dispatch path uses.
 * NOTE: /api/feedback is excluded from the auth middleware (public ingest
 * lives under it), so the auth check below is the only gate — do not remove.
 */

function composePrompt(feedback: SiteFeedback, projectName: string, note?: string): string {
  const lines = [
    `Fix this visitor feedback on ${projectName}.`,
    "",
    // The operator's note leads: it's the captain's steer on HOW to act on the
    // visitor's report, so it outranks the raw feedback below it.
    ...(note ? [`OPERATOR INSTRUCTION: ${note}`, ""] : []),
    `FEEDBACK: "${feedback.suggestion}"`,
    `Page: ${feedback.url ?? feedback.page ?? "unknown"}`,
  ];
  if (feedback.scope) lines.push(`Scope the visitor selected: ${feedback.scope}`);
  if (feedback.selectedElements?.length) {
    lines.push("Element(s) the visitor pointed at:");
    for (const el of feedback.selectedElements) {
      lines.push(`- <${el.elementType}> ${el.selector}${el.elementText ? ` — "${el.elementText}"` : ""}`);
    }
  }
  lines.push(
    "",
    "Scope: address exactly this feedback — no unrelated refactors.",
    "Verify the fix in the running app before claiming done, and record what you actually did (with evidence) in your final session handoff.",
  );
  return lines.join("\n");
}

const DispatchBody = z.object({
  /** Optional operator steer, prepended to the composed prompt. */
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const dataOrResp = await readJsonBody(req, DispatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const row = await getFeedbackWithProject(userId, idOrResp);
  if (!row) return jsonError("Not found", 404);
  if (row.feedback.status === FEEDBACK_STATUS.DISPATCHED) {
    return jsonError("Already dispatched", 409);
  }

  const { status, body } = await injectPrompt(
    { tab: row.projectName, customPrompt: composePrompt(row.feedback, row.projectName, dataOrResp.note || undefined) },
    userId,
  );
  if (status < 400) {
    const runId = typeof body.runId === "string" ? body.runId : undefined;
    await setFeedbackStatus(userId, idOrResp, FEEDBACK_STATUS.DISPATCHED, runId);
  }
  return NextResponse.json(body, { status });
}
