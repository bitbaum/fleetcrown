/**
 * Live check of the form-assist pipeline against the real model.
 *
 * Proves the two things that were broken: filling a form from prose, and then
 * CHANGING what is already there with a follow-up instruction.
 *
 * Run: npx tsx scripts/verify-ai-forms.ts
 */

import { runFormAssist } from "@fleet/ai-forms";
import { GOAL_FORM, SUBSCRIPTION_FORM } from "../src/config/ai-forms";
import { callGroqText } from "../src/lib/groq";

const complete = ({
  system,
  prompt,
  maxTokens,
  temperature,
}: {
  system: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
}) => callGroqText(prompt, { systemPrompt: system, maxTokens, temperature, timeoutMs: 30_000 });

let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label} — ${detail}`);
  if (!ok) failures++;
}

async function main() {
  console.log("\n1. Fill an empty Goal from prose");
  const filled = await runFormAssist({
    target: GOAL_FORM,
    request: {
      intent: "fill",
      instruction:
        "I want to ship the self-hosted payments layer for OrangeCat by the end of March 2026, so creators get paid without an intermediary.",
      values: {},
    },
    complete,
  });
  if (!filled.ok) {
    console.error("  ✗ fill failed:", filled.error);
    process.exit(1);
  }
  console.log("  message:", filled.message);
  console.log("  values :", JSON.stringify(filled.values));
  check("title filled", String(filled.values.title ?? "").length > 3, String(filled.values.title));
  check(
    "targetDate is an ISO calendar date in 2026-03",
    /^2026-03-\d{2}$/.test(String(filled.values.targetDate ?? "")),
    String(filled.values.targetDate),
  );
  check(
    "excluded field never written",
    filled.values.parentGoalId === undefined || filled.values.parentGoalId === "",
    String(filled.values.parentGoalId),
  );

  console.log("\n2. Follow up: change what is already there");
  // Seeded rather than reusing step 1's output: the model sometimes writes an
  // already-terse description, and "shorter" then legitimately changes nothing.
  const seeded = {
    title: "Ship self-hosted payments layer",
    description:
      "We are going to build and roll out a completely self-hosted payments layer for OrangeCat so that creators on the platform are able to receive money directly from their supporters without any intermediary sitting in the middle taking a cut or gatekeeping access.",
    targetDate: "2026-03-31",
  };
  const longDescription = seeded.description;
  const refined = await runFormAssist({
    target: GOAL_FORM,
    request: {
      intent: "refine",
      // Field-scoped on purpose: a bare "shorter" legitimately touches every
      // text field, so it cannot test that refinement stays where it is aimed.
      instruction: "make the description shorter, leave the title alone",
      values: seeded,
      history: [
        { role: "user", text: "ship the payments layer by end of March 2026" },
        { role: "assistant", text: filled.message },
      ],
    },
    complete,
  });
  if (!refined.ok) {
    console.error("  ✗ refine failed:", refined.error);
    process.exit(1);
  }
  console.log("  message:", refined.message);
  console.log("  description:", JSON.stringify(refined.values.description));
  check(
    "description actually changed (this is what used to silently no-op)",
    refined.values.description !== seeded.description,
    `${longDescription.length} chars -> ${String(refined.values.description ?? "").length}`,
  );
  check(
    "untouched field kept its value",
    refined.values.title === seeded.title,
    String(refined.values.title),
  );
  check("changed list is honest", refined.changed.length > 0, refined.changed.join(", "));

  console.log("\n3. A two-word instruction on a select + overridable defaults");
  const sub = await runFormAssist({
    target: SUBSCRIPTION_FORM,
    request: {
      intent: "fill",
      instruction: "GitHub Copilot, nineteen dollars a month, paid on the Visa ending 1234",
      values: { currency: "CHF", frequency: "monthly" },
    },
    complete,
  });
  if (!sub.ok) {
    console.error("  ✗ subscription fill failed:", sub.error);
    process.exit(1);
  }
  console.log("  values :", JSON.stringify(sub.values));
  check("amount parsed as a number", sub.values.amount === 19, String(sub.values.amount));
  check(
    "overridable default replaced by stated currency",
    sub.values.currency === "USD",
    String(sub.values.currency),
  );
  check(
    "frequency stayed a legal option value",
    ["monthly", "annual", "quarterly", "weekly", "one-time"].includes(String(sub.values.frequency)),
    String(sub.values.frequency),
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
