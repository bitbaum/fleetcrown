/**
 * Pure formatting for the operator dispatch-context block. DB-free on purpose —
 * the async assembler (dispatch-operator-context.ts) imports @/db/queries and so
 * can't host a DB-free self-test; the layout logic lives here where it can.
 */
import { toLocalDateStr } from "@/lib/dates";

/** Section heading — SSOT for how the operator block is framed at every dispatch
 *  site. Mirrors the "background, not instructions" framing of the fleet-RAG block
 *  so a well-aligned agent never mistakes it for a task. */
export const OPERATOR_CONTEXT_HEADING =
  "## The operator's goals & deadlines (background — align your priorities)";

export type OperatorGoalRow = { title: string; progress: number | null; targetDate: Date | null };
export type OperatorCommitmentRow = { description: string; dueDate: Date | null };

/** Pure formatter — no I/O, so the layout is unit-testable. Empty string when
 *  there is nothing to say (caller omits the section entirely). */
export function formatOperatorContextBlock(
  goals: OperatorGoalRow[],
  commitments: OperatorCommitmentRow[],
): string {
  if (goals.length === 0 && commitments.length === 0) return "";
  const lines: string[] = [];
  if (goals.length > 0) {
    lines.push("The operator's current top-level goals (aim your work to serve these):");
    for (const g of goals) {
      const progress = typeof g.progress === "number" ? ` (${g.progress}%)` : "";
      const target = g.targetDate ? ` — target ${toLocalDateStr(g.targetDate)}` : "";
      lines.push(`- ${g.title}${progress}${target}`);
    }
  }
  if (commitments.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("The operator's near-term commitments/deadlines (be mindful of these):");
    for (const c of commitments) {
      const due = c.dueDate ? ` — due ${toLocalDateStr(c.dueDate)}` : "";
      lines.push(`- ${c.description}${due}`);
    }
  }
  return lines.join("\n");
}

// ── Inline self-test (pure formatter — the layout logic) ──────────────────────
// Run with: npx tsx src/lib/dispatch-operator-context-format.ts --self-test
function selfTest(): void {
  let pass = 0;
  const cases: Array<[string, boolean]> = [];
  const check = (name: string, cond: boolean) => {
    cases.push([name, cond]);
    if (cond) pass++;
  };

  check("empty in ⇒ empty string", formatOperatorContextBlock([], []) === "");

  const d = new Date("2026-08-01T00:00:00Z");
  const goalsOnly = formatOperatorContextBlock([{ title: "Ship paid tier", progress: 40, targetDate: d }], []);
  check("goals header present", goalsOnly.includes("top-level goals"));
  check("goal progress rendered", goalsOnly.includes("(40%)"));
  check("goal target date rendered", goalsOnly.includes(`target ${toLocalDateStr(d)}`));
  check("no commitments header when none", !goalsOnly.includes("commitments/deadlines"));

  const commitsOnly = formatOperatorContextBlock([], [{ description: "Investor demo", dueDate: d }]);
  check("commitments header present", commitsOnly.includes("commitments/deadlines"));
  check("commitment due rendered", commitsOnly.includes(`due ${toLocalDateStr(d)}`));

  const nulls = formatOperatorContextBlock(
    [{ title: "G", progress: null, targetDate: null }],
    [{ description: "C", dueDate: null }],
  );
  check("no progress % when null", !nulls.split("\n")[1].includes("%"));
  check("no target when null goal date", !nulls.split("\n")[1].includes("target"));
  check("blank line separates the two sections", nulls.includes("\n\n"));

  for (const [name, ok] of cases) console.log(`${ok ? "✓" : "✗"} ${name}`);
  const total = cases.length;
  if (pass !== total) {
    console.error(`\n${pass}/${total} passed`);
    process.exit(1);
  }
  console.log(`\n${pass}/${total} passed`);
}

const isDirectCli = process.argv[1]?.endsWith("dispatch-operator-context-format.ts");
if (isDirectCli && process.argv.includes("--self-test")) selfTest();
