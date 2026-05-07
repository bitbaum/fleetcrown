import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { auth } from "@/auth";

const execAsync = promisify(exec);

const AiBriefBody = z.object({
  description: z.string().min(10).max(4000),
});

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short project name, 1-3 words, kebab-case friendly" },
    tagline: { type: "string", description: "One-sentence product description (≤120 chars)" },
    targetUser: { type: "string", description: "Who this is for in one short phrase" },
    coreProblem: { type: "string", description: "The pain point this solves in one sentence" },
    coreFeatures: {
      type: "array",
      items: { type: "string" },
      description: "3-5 core MVP features, each ≤60 chars",
    },
    stack: {
      type: "object",
      properties: {
        frontend: { type: "string" },
        backend: { type: "string" },
        db: { type: "string" },
      },
      required: ["frontend", "backend", "db"],
    },
    monetization: { type: "string", description: "How it makes money, one sentence" },
    launchStrategy: { type: "string", description: "First launch channel/approach" },
  },
  required: ["name", "tagline", "targetUser", "coreProblem", "coreFeatures", "stack"],
};

const BRIEF_PROMPT = (description: string) =>
  `You are a Y Combinator partner and senior product engineer. A founder just described their startup idea. Extract a structured project brief from it.

FOUNDER'S IDEA:
${description}

Extract the brief. Be opinionated: pick Next.js + TypeScript + Tailwind + Drizzle + PostgreSQL as the default stack unless the founder explicitly says otherwise. Keep each field concise. The project name should be lowercase-friendly (suitable as a directory and GitHub repo name).`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, AiBriefBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { description } = dataOrResp;

  try {
    const schemaArg = JSON.stringify(BRIEF_SCHEMA);
    const promptArg = BRIEF_PROMPT(description);

    const { stdout } = await execAsync(
      `claude --print --no-session-persistence --json-schema ${JSON.stringify(schemaArg)} ${JSON.stringify(promptArg)}`,
      { timeout: 30_000, maxBuffer: 512 * 1024 },
    );

    const brief = JSON.parse(stdout.trim());
    return NextResponse.json({ brief });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI brief generation failed: ${msg}` }, { status: 500 });
  }
}
