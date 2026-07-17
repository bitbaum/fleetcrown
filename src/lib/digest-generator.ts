// Shared digest-generation pipeline: take a per-user window + project filter,
// pull the activity, call Groq for a reader-friendly markdown summary, return
// both the markdown and the raw stats so callers can compose (email subject
// line, in-page render, agent context, etc.).
//
// Used by:
//   - /api/activity/digest        — on-demand UI button
//   - /api/crons/send-digest-emails — daily cron for opted-in users

import { callGroqText, GROQ_FAST_MODEL } from "@/lib/groq";
import { getProjectDigest, type ProjectDigest } from "@/db/queries/digests";
import { HTTP_TIMEOUT_MS } from "@/lib/constants/time";

export const DIGEST_SYSTEM_PROMPT = `You write short, executive-style activity reports for a developer running an AI agent fleet across multiple projects.

Your output is a markdown report. Strict constraints:
- Lead with a one-sentence headline ("**Headline:** …") describing what dominated the window.
- Then a 3–6 line "What happened" paragraph in plain English.
- Then "Per project" with one bullet per active project: "**<name>** — <one sentence>".
- If there were errors or stalled runs, surface them in a "Needs attention" section. Skip the section if nothing needs attention.
- End with "Next likely focus" — one sentence on where the fleet seems headed based on prompt cadence and recent intents.
- Do NOT pad. Do NOT restate the input. Do NOT use marketing language. No emojis.
- If the data is sparse (few prompts, no runs), say so honestly and keep the report short.
- Refer to projects by name as given. Refer to time as "the window".`;

function buildUserPrompt(digest: ProjectDigest, windowLabel: string): string {
  const lines: string[] = [];
  lines.push(`Window: last ${windowLabel}${digest.projectKey ? ` · filtered to project "${digest.projectKey}"` : ""}`);
  lines.push(`Totals: ${digest.stats.promptsSent} prompts dispatched, ${digest.stats.runsStarted} runs recorded, ${digest.stats.error} errored`);
  lines.push("");
  if (digest.projectStatuses.length > 0) {
    lines.push("Per-project activity (count · errors · success):");
    for (const p of digest.projectStatuses.slice(0, 12)) {
      lines.push(`- ${p.key}: ${p.total} events · ${p.errors} err · ${p.success} ok`);
    }
    lines.push("");
  }
  const recentPrompts = digest.timeline
    .filter((t) => t.kind === "prompt")
    .slice(0, 25);
  lines.push(`Most recent prompt bodies (up to ${recentPrompts.length}):`);
  for (const r of recentPrompts) {
    const snippet = (r.body || r.title).replace(/\s+/g, " ").slice(0, 240);
    lines.push(`- [${r.occurredAt.slice(0, 16)}] ${r.projectKey}: ${snippet}`);
  }
  return lines.join("\n");
}

export type GeneratedDigest = {
  digest: ProjectDigest;
  markdown: string;
  model: string;
  generatedAt: string;
};

const STATIC_EMPTY_MARKDOWN = (windowLabel: string) =>
  `**Headline:** No activity in the window.\n\nNothing was dispatched or finished in the last ${windowLabel}. Pick a wider window or dispatch a prompt from the Control panel.`;

// Generate a digest. Returns a static "no activity" markdown when the window
// is empty (skips the Groq call — no signal, no spend).
export async function generateDigest({
  userId,
  window,
  project,
  windowLabel,
}: {
  userId: string;
  window: string;
  project: string | null;
  windowLabel: string;
}): Promise<GeneratedDigest> {
  const digest = await getProjectDigest(userId, { window, projectKey: project });

  if (digest.timeline.length === 0) {
    return {
      digest,
      markdown: STATIC_EMPTY_MARKDOWN(windowLabel),
      model: "static",
      generatedAt: new Date().toISOString(),
    };
  }

  const userPrompt = buildUserPrompt(digest, windowLabel);
  const markdown = await callGroqText(userPrompt, {
    systemPrompt: DIGEST_SYSTEM_PROMPT,
    maxTokens: 700,
    temperature: 0.3,
    timeoutMs: HTTP_TIMEOUT_MS,
  });

  return {
    digest,
    markdown,
    model: GROQ_FAST_MODEL,
    generatedAt: new Date().toISOString(),
  };
}
