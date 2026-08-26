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
import { buildDigestUserPrompt } from "@/lib/digest-input";
import { HTTP_TIMEOUT_MS } from "@/lib/constants/time";

export const DIGEST_SYSTEM_PROMPT = `You write short, factual activity reports for a developer running an AI agent fleet across multiple projects.

You are given real events. Each event says what was ASKED for, what the agent REPORTED doing, what it says is NEXT, and how it ENDED (done / failed / timed out / still running).

Your output is a markdown report. Strict constraints:
- Lead with "**Headline:** …" — one sentence naming the single most important thing that happened. If work failed, that is the headline.
- Then "## Needs you" — ONLY when something failed, stalled, or is blocked. One bullet per item: name the project, say what broke in plain words using the recorded error, and say the concrete next action. Omit this whole section when nothing needs attention. Never invent a cause the data does not show.
- Then "## What shipped" — one bullet per project that completed real work, quoting what the agent reported doing. Omit if nothing completed.
- Then "## In flight" — anything still running, with how long it has been going. Omit if nothing is running.
- End with "## Next" — the concrete next steps, taken from the agents' own recorded "next" lines. Attribute them to their project. Omit if none were recorded.

Rules:
- Be specific. "Three runs failed" is useless; "truthseeker timed out after 1h — the agent was injected but never started generating" is useful.
- Use ONLY the supplied facts. Never guess why something failed, and never describe work that is not in the data.
- No preamble, no restating the input, no marketing language, no emojis.
- If the data is sparse, say so in one line and stop. A short honest report beats a padded one.`;

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

  if (digest.events.length === 0) {
    return {
      digest,
      markdown: STATIC_EMPTY_MARKDOWN(windowLabel),
      model: "static",
      generatedAt: new Date().toISOString(),
    };
  }

  const userPrompt = buildDigestUserPrompt({
    events: digest.events,
    projectKey: digest.projectKey,
    windowLabel,
  });
  const markdown = await callGroqText(userPrompt, {
    systemPrompt: DIGEST_SYSTEM_PROMPT,
    maxTokens: 900,
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
