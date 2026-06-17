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
  // A zellij dump-screen snapshot OR a raw-PTY byte delta (when append=true).
  // Capped to keep one frame well under typical body limits even with color
  // escapes + wide terminals.
  frame: z.string().max(256_000),
  // true → raw-PTY byte delta (viewer appends); absent → snapshot (viewer resets).
  append: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { tab, seq, frame, append } = dataOrResp;
  emitPeekFrame(userId, tab, { seq, frame, at: Date.now(), append });
  return NextResponse.json({ ok: true });
}
