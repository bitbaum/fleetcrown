import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { actions } from "@/db/schema";
import { listFeedbackSummary, listProjectFeedback } from "@/db/queries/site-feedback";
import { proposeAction } from "@/db/queries/actions";
import { callGroqText } from "@/lib/groq";
import { ACTION_STATUS, ACTION_TYPE, FEEDBACK_STATUS } from "@/lib/constants/statuses";
import type { SiteFeedback } from "@/db/schema";

/**
 * Feedback digester — the automation stage of the feedback→action pipeline,
 * and deliberately the LAST one built (docs/architecture/feedback-widget.md).
 * Clusters each busy project's NEW feedback into themes (Groq) and files each
 * theme as a status='draft' DISPATCH_PROMPT action: the operator reviews the
 * EXACT prompt that will run and approves it on /approvals (IRON RULE — raw
 * visitor text never reaches an agent without the human gate; it is untrusted
 * input, so the gate is a security boundary, not a courtesy).
 *
 * Bounded: min items per project, max proposals per project and per user per
 * tick, and a draft-dedupe (a project with an open dispatch_prompt draft is
 * skipped — approve or reject the standing proposal first).
 */

const MIN_ITEMS_PER_PROJECT = 3;
const MAX_THEMES_PER_PROJECT = 2;
const MAX_PROPOSALS_PER_USER = 5;
const MAX_ITEMS_TO_GROQ = 40;
const PROPOSAL_TTL_DAYS = 7;

type GroqTheme = { title: string; itemIndexes: number[]; proposedChange: string; where: string };

function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
}

async function clusterItems(items: SiteFeedback[], projectName: string): Promise<GroqTheme[]> {
  const numbered = items.map((f, i) =>
    `${i}. "${f.suggestion.replaceAll('"', "'").slice(0, 300)}" (page: ${f.url ?? f.page ?? "?"}${f.selectedElements?.length ? `, elements: ${f.selectedElements.map((el) => el.selector).join(" ")}` : ""})`,
  );
  const prompt = [
    `Visitor feedback items for the website "${projectName}":`,
    ...numbered,
    "",
    `Cluster them into at most ${MAX_THEMES_PER_PROJECT} themes where MULTIPLE items point at the same underlying problem. Ignore items that fit no theme.`,
    `Reply with ONLY this JSON: {"themes":[{"title":"<short theme>","itemIndexes":[0,2],"proposedChange":"<one concrete change addressing all of them>","where":"<pages/selectors affected>"}]}`,
    `A theme needs at least 2 items. If nothing clusters, reply {"themes":[]}.`,
  ].join("\n");

  const raw = await callGroqText(prompt, { maxTokens: 500, temperature: 0.2 });
  const parsed = JSON.parse(extractJson(raw)) as { themes?: GroqTheme[] };
  return (parsed.themes ?? [])
    .filter((t) => t && typeof t.title === "string" && Array.isArray(t.itemIndexes) && t.itemIndexes.length >= 2)
    .slice(0, MAX_THEMES_PER_PROJECT);
}

function composeThemePrompt(theme: GroqTheme, items: SiteFeedback[], projectName: string): string {
  const evidence = theme.itemIndexes
    .map((i) => items[i])
    .filter(Boolean);
  return [
    `Fix this visitor-feedback theme on ${projectName} (${evidence.length} independent reports).`,
    "",
    `THEME: ${theme.title}`,
    `PROPOSED CHANGE: ${theme.proposedChange}`,
    `WHERE: ${theme.where}`,
    "",
    "The reports:",
    ...evidence.map((f) => `- "${f.suggestion.slice(0, 300)}" (${f.url ?? f.page ?? "?"})`),
    "",
    "Scope: address exactly this theme — no unrelated refactors.",
    "Verify the fix in the running app before claiming done, and record what you actually did (with evidence) in your final session handoff.",
  ].join("\n");
}

export type DigestResult = { proposed: number; projectsScanned: number; skipped: string | null };

export async function digestFeedback(userId: string): Promise<DigestResult> {
  const summary = (await listFeedbackSummary(userId)).filter((s) => s.newCount >= MIN_ITEMS_PER_PROJECT);
  if (summary.length === 0) return { proposed: 0, projectsScanned: 0, skipped: "no busy inboxes" };

  // Draft-dedupe: one standing proposal set per project at a time.
  const drafts = await db
    .select({ payload: actions.payload })
    .from(actions)
    .where(and(
      eq(actions.userId, userId),
      eq(actions.type, ACTION_TYPE.DISPATCH_PROMPT),
      eq(actions.status, ACTION_STATUS.DRAFT),
    ));
  const projectsWithDrafts = new Set(
    drafts.map((d) => (typeof d.payload?.projectKey === "string" ? d.payload.projectKey : null)).filter(Boolean),
  );

  let proposed = 0;
  for (const s of summary) {
    if (proposed >= MAX_PROPOSALS_PER_USER) break;
    if (projectsWithDrafts.has(s.projectName)) continue;

    const items = (await listProjectFeedback(userId, s.projectId))
      .filter((f) => f.status === FEEDBACK_STATUS.NEW)
      .slice(0, MAX_ITEMS_TO_GROQ);
    if (items.length < MIN_ITEMS_PER_PROJECT) continue;

    let themes: GroqTheme[];
    try {
      themes = await clusterItems(items, s.projectName);
    } catch {
      continue; // Groq hiccup on one project must not kill the sweep.
    }

    for (const theme of themes) {
      if (proposed >= MAX_PROPOSALS_PER_USER) break;
      // Carry the clustered item ids so the executor can flip them to
      // 'dispatched' with the run id — that linkage is what lets
      // close-the-loop auto-resolve them when the run succeeds.
      const feedbackIds = theme.itemIndexes
        .map((i) => items[i]?.id)
        .filter((id): id is string => typeof id === "string");
      const created = await proposeAction(userId, {
        type: ACTION_TYPE.DISPATCH_PROMPT,
        title: `Fix visitor feedback: ${theme.title.slice(0, 120)} — ${s.projectName}`,
        description: `${theme.itemIndexes.length} submissions point at the same problem. Approving dispatches the prompt below to ${s.projectName}.`,
        payload: { projectKey: s.projectName, body: composeThemePrompt(theme, items, s.projectName), feedbackIds },
        reasoning: `Clustered from ${items.length} new feedback items on ${s.projectName}; theme evidence: ${theme.itemIndexes.length} independent reports.`,
        entityId: s.projectId,
        expiresAt: new Date(Date.now() + PROPOSAL_TTL_DAYS * 24 * 60 * 60 * 1000),
      });
      if (created) proposed += 1;
    }
  }

  return { proposed, projectsScanned: summary.length, skipped: null };
}
