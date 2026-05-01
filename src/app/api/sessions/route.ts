import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";


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

const SESSIONS_DIR = `${process.env.HOME ?? "/home/g"}/.claude/sessions`;
const FIELDS = ["done", "next", "tests", "todos", "health"] as const;
type Field = typeof FIELDS[number];

/** Parse a session .md file into its key fields. */
function parseSession(raw: string): Omit<SessionData & { found: true }, "found" | "raw"> {
  const result = Object.fromEntries(FIELDS.map((f) => [f, ""])) as Record<Field, string>;
  let current: Field | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (current && buffer.length > 0) {
      result[current] = buffer.join("\n").trim();
    }
    buffer.length = 0;
  };

  for (const line of raw.split("\n")) {
    const match = line.match(/^(done|next|tests|todos|health):\s*(.*)/);
    if (match) {
      flush();
      current = match[1] as Field;
      if (match[2]) buffer.push(match[2]);
    } else if (current && line.startsWith("## ")) {
      // Stop parsing at the first ## section
      flush();
      current = null;
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();

  return result;
}

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
    const parsed = parseSession(raw);
    return NextResponse.json({ found: true, ...parsed, raw } satisfies SessionData);
  } catch {
    return NextResponse.json({ found: false } satisfies SessionData);
  }
}
