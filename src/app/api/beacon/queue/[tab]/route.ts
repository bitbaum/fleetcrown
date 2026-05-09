import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { stateFile } from "@/lib/agent-config";
import { readJsonBody, z } from "@/lib/api/route-helpers";

function readQueueFile(tab: string): { queue: string[]; exists: boolean } {
  const p = stateFile.queue(tab);
  try {
    return { queue: JSON.parse(fs.readFileSync(p, "utf-8")) as string[], exists: true };
  } catch {
    return { queue: [], exists: fs.existsSync(p) }; // exists=true means corrupt JSON, not missing
  }
}

function writeQueueFile(tab: string, queue: string[]): void {
  const p = stateFile.queue(tab);
  fs.writeFileSync(p + ".tmp", JSON.stringify(queue));
  fs.renameSync(p + ".tmp", p);
}

const PutBody = z.object({
  queue: z.array(z.string().max(4000)).max(200),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  return NextResponse.json(readQueueFile(tab.toLowerCase()));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const bodyOrResp = await readJsonBody(req, PutBody);
  if (bodyOrResp instanceof NextResponse) return bodyOrResp;
  writeQueueFile(tab.toLowerCase(), bodyOrResp.queue);
  return NextResponse.json({ ok: true });
}
