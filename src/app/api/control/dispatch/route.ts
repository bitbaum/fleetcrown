/**
 * POST /api/control/dispatch
 *
 * Strategist layer: decides whether to drain the queue or run next_best
 * given the current session handoff, pending queue items, and project context.
 *
 * Returns quickly (< 300ms on Groq free tier). Falls back to QUEUE if Groq
 * is unavailable, preserving the existing behaviour without breaking callers.
 *
 * This is Step 2 of the dispatch intelligence path. Step 3 will wire it into
 * handleAutoInject in ProjectCard.
 */

import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const HandoffSchema = z.object({
  done:   z.string().default(""),
  next:   z.string().default(""),
  health: z.string().default(""),
  tests:  z.string().default(""),
  todos:  z.string().default(""),
});

const DispatchBody = z.object({
  handoff:     HandoffSchema,
  queue:       z.array(z.string().trim().min(1)).max(20),
  projectName: z.string().optional(),
  gitBranch:   z.string().optional(),
});

export type DispatchAction = "queue" | "nextbest";

export type DispatchResult = {
  action: DispatchAction;
  reason: string;
  /** Which inference path produced the decision. */
  source: "groq" | "health_gate" | "empty_queue" | "fallback";
};

// ── Prompt construction ────────────────────────────────────────────────────

function buildPrompt(
  handoff: z.infer<typeof HandoffSchema>,
  queue: string[],
  projectName?: string,
  gitBranch?: string,
): string {
  const projectCtx = [
    projectName ? `Project: ${projectName}` : "",
    gitBranch   ? `Branch: ${gitBranch}`    : "",
  ].filter(Boolean).join("  |  ");

  const queueList = queue
    .slice(0, 5)
    .map((item, i) => `${i + 1}. ${item}`)
    .join("\n");
  const queueOverflow = queue.length > 5 ? `\n(+${queue.length - 5} more items)` : "";

  return `You are a dispatch strategist for an AI coding agent workflow.
${projectCtx ? `\n${projectCtx}\n` : ""}
The agent just finished a work session. Handoff summary:
  done:   ${handoff.done || "(none)"}
  next:   ${handoff.next || "(none)"}
  health: ${handoff.health || "unknown"}
  tests:  ${handoff.tests || "unknown"}

The queue has ${queue.length} pending task${queue.length === 1 ? "" : "s"}:
${queueList}${queueOverflow}

Decide: should the agent next run queue item 1, or follow its own suggested next step?

Rules:
- Prefer QUEUE when: the first queue item is contextually related to what was just done, OR health is good and there is no strong continuity signal.
- Prefer NEXTBEST when: the agent's "next" field describes an obvious direct follow-up to "done", OR health is "needs attention" and the queue item is unrelated.
- NEXTBEST is already required (caller enforces it) when health is "critical" or tests contain "fail" — do not factor those in; focus on the subtler cases.

Respond in exactly this format (two lines, nothing else):
ACTION: QUEUE
REASON: one sentence explaining why the queue item should fire next

or

ACTION: NEXTBEST
REASON: one sentence explaining why the agent's continuation is better right now`;
}

// ── Groq call ─────────────────────────────────────────────────────────────

async function callGroq(prompt: string): Promise<{ action: DispatchAction; reason: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no key");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 100,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = (data?.choices?.[0]?.message?.content ?? "").trim();

  return parseGroqResponse(text);
}

function parseGroqResponse(text: string): { action: DispatchAction; reason: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let action: DispatchAction = "queue";
  let reason = "Continuing with queue order.";

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("ACTION:")) {
      const val = upper.replace("ACTION:", "").trim();
      action = val === "NEXTBEST" ? "nextbest" : "queue";
    }
    if (line.toLowerCase().startsWith("reason:")) {
      reason = line.slice("reason:".length).trim();
    }
  }

  return { action, reason };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, DispatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { handoff, queue, projectName, gitBranch } = dataOrResp;

  // No queue items — trivially run next_best.
  if (queue.length === 0) {
    return NextResponse.json({
      action: "nextbest",
      reason: "Queue is empty — running AI-driven next step.",
      source: "empty_queue",
    } satisfies DispatchResult);
  }

  // Hard health gate (duplicate of client-side check — defence in depth).
  const health = handoff.health.toLowerCase();
  const tests  = handoff.tests.toLowerCase();
  if (health.includes("critical") || tests.includes("fail")) {
    return NextResponse.json({
      action: "nextbest",
      reason: `${health.includes("critical") ? "Health critical" : "Tests failing"} — agent must stay focused on recovery before switching concerns.`,
      source: "health_gate",
    } satisfies DispatchResult);
  }

  // Groq classification.
  const prompt = buildPrompt(handoff, queue, projectName, gitBranch);

  try {
    const { action, reason } = await callGroq(prompt);
    return NextResponse.json({ action, reason, source: "groq" } satisfies DispatchResult);
  } catch {
    // Groq unavailable or no key — fall back to queue drain (existing behaviour).
    return NextResponse.json({
      action: "queue",
      reason: "Groq unavailable — using queue order.",
      source: "fallback",
    } satisfies DispatchResult);
  }
}
