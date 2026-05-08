import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { SESSIONS_DIR } from "@/lib/agent-config";
import { parseSessionFile } from "@/lib/session-content";

export type SessionData = {
  found: false;
} | {
  found: true;
  done: string;
  next: string;
  tests: string;
  todos: string;
  health: string;
  raw: string;
};

/** Find a session file matching the project name (case-insensitive, dash-tolerant). */
function findSessionFile(projectName: string): string | null {
  if (!fs.existsSync(SESSIONS_DIR)) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]/g, "");
  const target = normalize(projectName);

  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const stem = path.basename(file, ".md");
      if (normalize(stem) === target) return path.join(SESSIONS_DIR, file);
    }
  } catch {
    return null;
  }

  return null;
}

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project || project.length > 100) {
    return NextResponse.json({ found: false } satisfies SessionData);
  }

  const filePath = findSessionFile(project);
  if (!filePath) return NextResponse.json({ found: false } satisfies SessionData);

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = parseSessionFile(raw);
    return NextResponse.json({ found: true, ...parsed, raw } satisfies SessionData);
  } catch {
    return NextResponse.json({ found: false } satisfies SessionData);
  }
}
