/**
 * Shared parsers for Claude session handoff content.
 *
 * Two formats exist:
 *   parseSessionText  — beacon DB content; done/next/in_progress are semicolon-delimited lists
 *   parseSessionFile  — on-disk .md handoff files; multi-line values, stops at ## sections
 */

import {
  ORCHESTRATION_TASK_SUMMARY_FIELDS,
  type OrchestrationTaskSummaryField,
  type OrchestrationTaskSummary,
} from "@/lib/orchestration/contract";

export function splitSessionItems(text: string): string[] {
  return text.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
}

// ── Beacon DB content parser ──────────────────────────────────────────────────

type ParsedSession = {
  status: string;
  done: string[];
  next: string[];
  in_progress: string[];
  tests: string;
  todos: string;
  health: string;
  noOpCount: number | null;
};

export function parseSessionText(content: string): ParsedSession {
  const result: ParsedSession = { status: "", done: [], next: [], in_progress: [], tests: "", todos: "", health: "", noOpCount: null };
  for (const line of content.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    const v = line.slice(idx + 1).trim();
    if (k === "status") result.status = v;
    else if (k === "done") result.done = splitSessionItems(v);
    else if (k === "next") result.next = splitSessionItems(v);
    else if (k === "in_progress") result.in_progress = splitSessionItems(v);
    else if (k === "tests") result.tests = v;
    else if (k === "todos") result.todos = v;
    else if (k === "health") result.health = v;
    else if (k === "no-op-count" && /^\d+$/.test(v)) result.noOpCount = parseInt(v, 10);
  }
  return result;
}

// ── On-disk .md session file parser ──────────────────────────────────────────
// Supports multi-line values (continuation lines after the initial "key: val"
// line are appended until the next key or a ## section header is reached).

export function parseSessionFile(raw: string): OrchestrationTaskSummary {
  const result = Object.fromEntries(
    ORCHESTRATION_TASK_SUMMARY_FIELDS.map((f) => [f, ""]),
  ) as Record<OrchestrationTaskSummaryField, string>;

  let current: OrchestrationTaskSummaryField | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (current && buffer.length > 0) result[current] = buffer.join("\n").trim();
    buffer.length = 0;
  };

  const fieldRe = new RegExp(`^(${ORCHESTRATION_TASK_SUMMARY_FIELDS.join("|")}):\\s*(.*)`);
  for (const line of raw.split("\n")) {
    const m = line.match(fieldRe);
    if (m) {
      flush();
      current = m[1] as OrchestrationTaskSummaryField;
      if (m[2]) buffer.push(m[2]);
    } else if (current && line.startsWith("## ")) {
      flush();
      current = null;
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();

  return result;
}
