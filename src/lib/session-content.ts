/**
 * Shared parser for Claude session handoff files.
 * Format: "key: value" lines, semicolons separate list items within a value.
 */
export type ParsedSession = {
  done: string[];
  next: string[];
  in_progress: string[];
  tests: string;
  todos: string;
  health: string;
};

export function parseSessionText(content: string): ParsedSession {
  const result: ParsedSession = { done: [], next: [], in_progress: [], tests: "", todos: "", health: "" };
  for (const line of content.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    const v = line.slice(idx + 1).trim();
    if (k === "done") result.done = v.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
    else if (k === "next") result.next = v.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
    else if (k === "in_progress") result.in_progress = v.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
    else if (k === "tests") result.tests = v;
    else if (k === "todos") result.todos = v;
    else if (k === "health") result.health = v;
  }
  return result;
}
