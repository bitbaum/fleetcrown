/**
 * Thin HTTP boundary over the shared command resolver (SSOT lives in
 * src/lib/command-resolve.ts). Validates the body, scopes by user, and
 * delegates to resolveCommand() — the same resolver the Loki messages route
 * uses, so the two never drift.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApiUserId } from "@/lib/session";
import { resolveCommand, type CommandResolution } from "@/lib/command-resolve";

// Re-exported so existing importers of the type keep working after the move.
export type { CommandResolution };

const Body = z.object({
  text: z.string().trim().min(1).max(2000),
  projects: z.array(z.string().trim().min(1)).max(200).default([]),
  selectedProject: z.string().trim().min(1).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const resolution = await resolveCommand(body, userId);
  return NextResponse.json(resolution);
}
