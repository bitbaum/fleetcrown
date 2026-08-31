import { NextRequest, NextResponse } from "next/server";
import { getCommandById } from "@/db/queries/pending-commands";
import { getSessionUserId } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cmd = await getCommandById(id);
  if (!cmd || cmd.userId !== userId || cmd.type !== "peek_tab") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!cmd.executedAt) {
    return NextResponse.json({ status: "pending" });
  }

  const result = cmd.result as { ok?: boolean; text?: string; error?: string } | null;
  if (result?.ok) {
    return NextResponse.json({ status: "done", content: result.text ?? "" });
  }

  return NextResponse.json({ status: "error", error: result?.error ?? "Peek failed" });
}
