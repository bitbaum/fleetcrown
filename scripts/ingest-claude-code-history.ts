// Ingest local Claude Code conversation transcripts into the FleetCrown DB so
// /activity can show "what was typed locally" alongside "what was dispatched
// through /control." Source of truth is the per-session JSONL the CLI writes
// at ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl.
//
// Idempotent: dedup key is (session_id, event_uuid). Re-runs over the same
// JSONL files are no-ops. Incremental ingest is just a re-run — JSONLs only
// grow, conflicts swallow already-ingested events.
//
// Usage:
//   npm run ingest:history             # one-shot, every JSONL under ~/.claude/projects
//   tsx scripts/ingest-claude-code-history.ts --dir <abs-path>   # one specific JSONL dir
//   tsx scripts/ingest-claude-code-history.ts --since <ISO>      # skip files older than ISO

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { db } from "@/db";
import { claudeCodeHistory, type NewClaudeCodeHistoryRow } from "@/db/schema/claude-code-history";
import { userProjects } from "@/db/schema/user-projects";
import { getDefaultUser } from "@/db/queries/users";
import { eq, and } from "drizzle-orm";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

type JsonlEvent = {
  type?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
  };
};

function extractText(content: JsonlEvent["message"] extends { content: infer C } ? C : unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
      parts.push(item.text);
    }
  }
  return parts.join("\n").trim();
}

type ProjectIndex = Array<{ key: string; dirPath: string }>;

async function loadProjectIndex(userId: string): Promise<ProjectIndex> {
  const rows = await db
    .select({ name: userProjects.name, dirPath: userProjects.dirPath })
    .from(userProjects)
    .where(and(eq(userProjects.userId, userId), eq(userProjects.isActive, true)));
  return rows
    .filter((r): r is { name: string; dirPath: string } => Boolean(r.dirPath))
    .map((r) => ({ key: r.name, dirPath: r.dirPath.replace(/\/+$/, "") }))
    .sort((a, b) => b.dirPath.length - a.dirPath.length);
}

function resolveProjectKey(cwd: string | undefined, index: ProjectIndex): string | null {
  if (!cwd) return null;
  const normalized = cwd.replace(/\/+$/, "");
  for (const entry of index) {
    if (normalized === entry.dirPath) return entry.key;
    if (normalized.startsWith(entry.dirPath + "/")) return entry.key;
  }
  return null;
}

async function ingestJsonl(
  path: string,
  userId: string,
  projectIndex: ProjectIndex,
): Promise<{ added: number; skipped: number; errored: number }> {
  const text = await readFile(path, "utf8");
  const lines = text.split("\n");
  const batch: NewClaudeCodeHistoryRow[] = [];
  let errored = 0;

  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;
    let event: JsonlEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      errored++;
      continue;
    }
    if (event.type !== "user" && event.type !== "assistant") continue;
    if (!event.uuid || !event.sessionId || !event.timestamp) continue;
    const occurredAt = new Date(event.timestamp);
    if (Number.isNaN(occurredAt.getTime())) continue;
    const promptText = extractText(event.message?.content);
    if (!promptText) continue;
    const projectKey = resolveProjectKey(event.cwd, projectIndex);
    batch.push({
      userId,
      projectKey,
      projectPath: event.cwd ?? "",
      gitBranch: event.gitBranch ?? null,
      sessionId: event.sessionId,
      eventUuid: event.uuid,
      promptType: event.type,
      promptText,
      occurredAt,
    });
  }

  if (batch.length === 0) return { added: 0, skipped: 0, errored };

  // Chunk inserts so a single huge JSONL doesn't blow past postgres's parameter
  // limit. ~600 rows × ~10 cols ≈ 6000 params, comfortably under 65535.
  let added = 0;
  const CHUNK = 500;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK);
    const result = await db
      .insert(claudeCodeHistory)
      .values(slice)
      .onConflictDoNothing({ target: [claudeCodeHistory.sessionId, claudeCodeHistory.eventUuid] })
      .returning({ id: claudeCodeHistory.id });
    added += result.length;
  }
  return { added, skipped: batch.length - added, errored };
}

async function listJsonlFiles(root: string, sinceMs: number | null): Promise<string[]> {
  let dirs: string[];
  try {
    dirs = await readdir(root, { withFileTypes: true })
      .then((entries) => entries.filter((e) => e.isDirectory()).map((e) => join(root, e.name)));
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const dir of dirs) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const full = join(dir, entry.name);
      if (sinceMs !== null) {
        const s = await stat(full).catch(() => null);
        if (!s || s.mtimeMs < sinceMs) continue;
      }
      out.push(full);
    }
  }
  return out;
}

function parseArgs(argv: string[]): { dir: string; sinceMs: number | null } {
  let dir = CLAUDE_PROJECTS_DIR;
  let sinceMs: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dir" && argv[i + 1]) {
      dir = argv[i + 1];
      i++;
    } else if (arg === "--since" && argv[i + 1]) {
      const t = Date.parse(argv[i + 1]);
      if (!Number.isNaN(t)) sinceMs = t;
      i++;
    }
  }
  return { dir, sinceMs };
}

async function main() {
  const { dir, sinceMs } = parseArgs(process.argv.slice(2));
  const user = await getDefaultUser();
  if (!user) {
    console.error("ingest-history: no default user in DB. Onboard a user first.");
    process.exit(1);
  }
  const projectIndex = await loadProjectIndex(user.id);
  console.log(`ingest-history: scanning ${dir} (${projectIndex.length} projects indexed)`);
  if (sinceMs !== null) console.log(`ingest-history: filtering files modified since ${new Date(sinceMs).toISOString()}`);

  const files = await listJsonlFiles(dir, sinceMs);
  console.log(`ingest-history: ${files.length} JSONL file(s) to process`);

  let totalAdded = 0, totalSkipped = 0, totalErrored = 0;
  for (const file of files) {
    try {
      const r = await ingestJsonl(file, user.id, projectIndex);
      totalAdded += r.added;
      totalSkipped += r.skipped;
      totalErrored += r.errored;
      if (r.added > 0 || r.errored > 0) {
        console.log(`  ${file}: +${r.added} added, ${r.skipped} skipped, ${r.errored} errored`);
      }
    } catch (err) {
      console.error(`  ${file}: failed —`, (err as Error).message);
    }
  }
  console.log(`\nDone. ${totalAdded} new event(s), ${totalSkipped} already in DB, ${totalErrored} malformed line(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("ingest-history: fatal —", err);
  process.exit(1);
});
