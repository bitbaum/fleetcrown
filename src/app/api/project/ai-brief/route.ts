import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { auth } from "@/auth";

export const maxDuration = 90;

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
    const stdout = await new Promise<string>((resolve, reject) => {
      let out = "";
      let err = "";
      const child = spawn("claude", [
        "--print",
        "--no-session-persistence",
        "--output-format", "json",
        "--json-schema", JSON.stringify(BRIEF_SCHEMA),
        BRIEF_PROMPT(description),
      ]);
      child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { err += d.toString(); });
      child.on("close", (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(err || `claude exited with code ${code}`));
      });
      child.on("error", reject);
      setTimeout(() => { child.kill(); reject(new Error("timeout")); }, 90_000);
    });

    const envelope = JSON.parse(stdout.trim());
    const brief = envelope.structured_output ?? envelope;
    return NextResponse.json({ brief });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI brief generation failed: ${msg}` }, { status: 500 });
  }
}
