/**
 * POST /api/control/peek-frame
 *
 * The Fleet Runner posts one changed dump-screen frame for a tab it is
 * streaming (it only streams while a viewer is watching — see peek-stream).
 * We fan the frame to that (user, tab)'s SSE viewers via the in-process bus.
 *
 * Auth: the runner's ck_* token (same as runtime-state). Frames can contain
 * on-screen secrets — never logged. See docs/architecture/embedded-terminal.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { emitPeekFrame } from "@/lib/sse-bus";

const Body = z.object({
  tab:   z.string().trim().min(1).max(120),
  seq:   z.number().int().nonnegative(),
  // A full dump-screen snapshot (ANSI preserved). Capped to keep one frame
  // well under typical body limits even with color escapes + wide terminals.
  frame: z.string().max(256_000),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { tab, seq, frame } = dataOrResp;
  emitPeekFrame(userId, tab, { seq, frame, at: Date.now() });
  return NextResponse.json({ ok: true });
}
