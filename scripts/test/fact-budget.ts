/**
 * Inline tests for the tool loop's fact-budget policy
 * (lib/agent/fact-budget.ts). The invariant under test: TOOL RESULTS ALWAYS
 * SURVIVE shedding. Two production incidents came from head-keeping slices
 * silently deleting the tail — the model fetched the approval queue and then
 * answered "Not in your data." because the facts it fetched never reached the
 * prompt.
 *
 * Run: npm run test:fact-budget
 */
import {
  trimFactsToBudget,
  mergeFactsWithCap,
  fitFactsToBudget,
  estimateTokens,
  omissionNotice,
} from "@/lib/agent/fact-budget";
import type { Fact } from "ai-kit/grounding";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const fact = (subject: string): Fact =>
  ({ kind: "document", subject, source: "test", values: { title: subject } }) as unknown as Fact;

const range = (prefix: string, n: number): Fact[] =>
  Array.from({ length: n }, (_, i) => fact(`${prefix}${i}`));

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  check("merge under cap keeps everything in order", () => {
    const out = mergeFactsWithCap(range("seed", 5), range("tool", 3), 40);
    assert(out.length === 8 && out[5]!.subject === "tool0", `got ${out.length}`);
  });

  check("merge at full cap: EVERY fresh tool fact survives (the prod bug)", () => {
    const out = mergeFactsWithCap(range("seed", 40), range("tool", 8), 40);
    const tools = out.filter((f) => f.subject.startsWith("tool"));
    assert(out.length === 40 && tools.length === 8, `kept ${tools.length}/8 tool facts`);
    assert(out[out.length - 1]!.subject === "tool7", "fresh facts must sit at the tail");
  });

  check("merge with more fresh facts than the cap keeps the first cap of them", () => {
    const out = mergeFactsWithCap(range("seed", 10), range("tool", 50), 40);
    assert(
      out.length === 40 && out.every((f) => f.subject.startsWith("tool")),
      "cap of fresh only",
    );
  });

  check("trim under budget is identity", () => {
    const all = range("f", 10);
    assert(trimFactsToBudget(all, 10) === all, "no copy when it already fits");
  });

  check("trim keeps both ends — tail (tool results) survives", () => {
    const all = [...range("seed", 35), ...range("tool", 5)];
    const out = trimFactsToBudget(all, 10);
    const tools = out.filter((f) => f.subject.startsWith("tool"));
    assert(
      out.length === 10 && tools.length === 5,
      `kept ${tools.length}/5 tool facts at budget 10`,
    );
    assert(out[0]!.subject === "seed0", "head of seed also kept");
  });

  check("trim to odd budget still totals the budget", () => {
    const out = trimFactsToBudget(range("f", 40), 5);
    assert(out.length === 5, `got ${out.length}`);
  });

  check("trim to zero means zero — slice(-0) would return EVERYTHING", () => {
    assert(trimFactsToBudget(range("f", 40), 0).length === 0, "budget 0 kept facts");
    assert(trimFactsToBudget(range("f", 40), -3).length === 0, "negative budget kept facts");
  });

  // ── fitting the prompt to a per-call token budget ──────────────────────────
  // Each rendered fact below is 100 chars = 25 estimated tokens, so the maths in
  // these cases is checkable by hand rather than by trusting the estimator.
  const render = (fs: Fact[]) => fs.map((f) => f.subject.padEnd(100, ".")).join("");

  check("a prompt that already fits is returned untouched", () => {
    const all = range("f", 10);
    assert(fitFactsToBudget(all, render, 0, 10_000) === all, "no copy when it already fits");
  });

  check("an oversized prompt is cut to what the budget allows", () => {
    // 40 facts = 4000 chars = 1000 tokens. Budget 300 ⇒ ~12 facts.
    const out = fitFactsToBudget(range("f", 40), render, 0, 300);
    assert(out.length > 0 && out.length <= 12, `expected ≤12 facts, got ${out.length}`);
    assert(estimateTokens(render(out)) <= 300, "result still busts the budget");
  });

  check("the fit is the LARGEST that fits, not merely a safe one", () => {
    const all = range("f", 40);
    const out = fitFactsToBudget(all, render, 0, 300);
    const oneMore = trimFactsToBudget(all, out.length + 1);
    assert(estimateTokens(render(oneMore)) > 300, `${out.length + 1} facts would also have fit`);
  });

  check("overhead is charged before facts — a growing conversation sheds more", () => {
    const all = range("f", 40);
    const roomy = fitFactsToBudget(all, render, 0, 400);
    const cramped = fitFactsToBudget(all, render, 1200 /* chars = 300 tok */, 400);
    assert(cramped.length < roomy.length, `overhead ignored: ${cramped.length} vs ${roomy.length}`);
  });

  check("tool results survive the fit (the invariant, at the token layer)", () => {
    const all = [...range("seed", 35), ...range("tool", 5)];
    const out = fitFactsToBudget(all, render, 0, 300);
    const tools = out.filter((f) => f.subject.startsWith("tool"));
    assert(tools.length > 0, "fitting the budget deleted every tool result");
    assert(out[out.length - 1]!.subject === "tool4", "freshest tool fact must survive at the tail");
  });

  check("overhead alone busting the budget yields no facts, not a wrong answer", () => {
    // Nothing can be shed to fix this; returning facts anyway would hide it.
    const out = fitFactsToBudget(range("f", 40), render, 8000 /* = 2000 tok */, 300);
    assert(out.length === 0, `expected 0 facts, got ${out.length}`);
  });

  // ── shedding must be announced ────────────────────────────────────────────
  // Loki reported "You are tracking 5 projects" against an account holding 22:
  // the five were the tail that survived the trim, and nothing told the model a
  // longer list existed. A count drawn from a silently shortened list is worse
  // than a refusal, because it arrives with citations.

  check("nothing withheld ⇒ no notice (a notice that always fires is ignored)", () => {
    assert(omissionNotice(40, 40) === "", "notice emitted when the whole set was sent");
    assert(omissionNotice(0, 0) === "", "notice emitted for an empty fact set");
  });

  check("withholding states BOTH the sent count and the true total", () => {
    const notice = omissionNotice(22, 5);
    // The true total is the number the wrong answer got wrong — it has to appear.
    assert(notice.includes("22"), "notice omits the true total");
    assert(notice.includes("5"), "notice omits how many were sent");
    assert(notice.includes("17"), "notice omits how many were withheld");
  });

  check("the notice forbids the specific move that caused the bug", () => {
    const notice = omissionNotice(22, 5).toLowerCase();
    assert(notice.includes("incomplete"), "notice does not say the list is incomplete");
    assert(
      notice.includes("do not state a total") && notice.includes("complete list"),
      "notice does not forbid stating a total / presenting a complete list",
    );
  });

  check("the notice is sized INSIDE the fit, so reporting shedding cannot cause it", () => {
    // Render exactly as loop.ts does: context plus the notice for what was cut.
    const all = range("f", 40);
    const withNotice = (fs: Fact[]) => render(fs) + omissionNotice(all.length, fs.length);
    const out = fitFactsToBudget(all, withNotice, 0, 300);
    assert(out.length > 0, "fit shed everything once the notice was charged");
    assert(
      estimateTokens(withNotice(out)) <= 300,
      "prompt busts the budget once the notice is included — the notice was not charged",
    );
  });

  console.log(`\n${passed} passed`);
}

runTests();
