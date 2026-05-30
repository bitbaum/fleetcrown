import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { enqueueInjectCommand } from "@/db/queries/pending-commands";
import { getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";

const Body = z.object({
  tab: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { tab, prompt } = dataOrResp;

  if (isRuntimeAvailable()) {
    const [{ injectIntoTab, isUserTypingInTab }, { stateFile, clearHandshakeFiles }, fs] = await Promise.all([
      import("@/lib/zellij"),
      import("@/lib/agent-config"),
      import("fs"),
    ]);
    if (isUserTypingInTab(tab)) {
      return NextResponse.json({ ok: true, blocked: true, reason: "user-typing", tab });
    }
    const nowS = Math.floor(Date.now() / 1000);
    fs.writeFileSync(stateFile.prompt(tab), JSON.stringify({
      key: "custom",
      label: prompt.slice(0, 40),
      startedAt: nowS,
      source: "inject",
      adapter: "unknown",
    }));
    clearHandshakeFiles(tab);
    injectIntoTab(tab, prompt);
    return NextResponse.json({ ok: true, mode: "direct", tab });
  }

  const commandId = await enqueueInjectCommand(userId, {
    tab,
    prompt,
    promptKey: "",
    promptLabel: prompt.slice(0, 40),
    adapter: "unknown",
  });
  return NextResponse.json({ ok: true, mode: "queued", commandId, tab });
}
