/**
 * Thin HTTP boundary over the inject core (SSOT in src/lib/inject-core.ts).
 * Parses the body, authenticates, logs the unauthenticated case (needs the
 * request headers), then delegates to injectPrompt() — the same dispatcher the
 * Loki messages route calls in-process, so the two never drift.
 */
import { NextRequest, NextResponse } from "next/server";
import { ORCHESTRATION_ADAPTER_IDS } from "@/lib/orchestration";
import { getApiUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { logDebug } from "@/db/queries/debug-logs";
import { injectPrompt } from "@/lib/inject-core";

const InjectBody = z.object({
  tab:          z.string().min(1).max(80),
  promptKey:    z.string().optional(),
  customPrompt: z.string().max(4000).optional(),
  adapter:      z.enum(ORCHESTRATION_ADAPTER_IDS).optional(),
  runId:        z.string().uuid().optional(),
  // Captain-initiated injects (Control, palette) set this so the operator
  // gets a notification when the run finishes. Autopilot must omit it.
  notifyOnClose: z.boolean().optional(),
}).refine((d) => d.promptKey || d.customPrompt, { message: "promptKey or customPrompt required" });

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, InjectBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { tab, promptKey, customPrompt, adapter, runId, notifyOnClose } = dataOrResp;

  const userId = await getApiUserId();
  if (!userId) {
    // Session-expiry / unauthenticated path. This is the most likely
    // server-side root cause of the "I sent something but it isn't here"
    // mobile incident — a long-lived mobile tab whose JWT lapsed, the
    // client throws and surfaces the inline error (post-9c2525c), and
    // forensics need the server-side counterpart to correlate. Body has
    // already parsed at this point, so a 401 here is a real user attempt
    // (random bots fail readJsonBody → 400 above, never reach this line).
    logDebug({
      source: "api/inject",
      level: "warn",
      message: "Unauthenticated inject attempt — likely session expiry",
      meta: {
        tab,
        adapter: adapter ?? "claude",
        hasPromptKey: !!promptKey,
        hasCustomPrompt: !!customPrompt,
        customPromptLen: customPrompt?.length ?? 0,
        userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
        referer: req.headers.get("referer") ?? null,
      },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status, body } = await injectPrompt({ tab, promptKey, customPrompt, adapter, runId, notifyOnClose }, userId);
  return NextResponse.json(body, { status });
}
