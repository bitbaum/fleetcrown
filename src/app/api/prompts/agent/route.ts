import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { PROMPTS_FILE } from "@/lib/agent-config";
import { getSessionUserId } from "@/lib/session";

// readFileSync has no Next.js dynamic signal — force dynamic so middleware runs.
export const dynamic = "force-dynamic";

export type AgentPrompt = {
  key: string;
  slot: number | null;
  icon: string;
  label: string;
  style: "primary" | "action" | "more" | "dimension" | "internal";
  category: string;
  dimensionId: string | null;
  prompt: string;
};

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = readFileSync(PROMPTS_FILE(), "utf-8");
    const prompts: AgentPrompt[] = JSON.parse(raw);
    return NextResponse.json(prompts);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
