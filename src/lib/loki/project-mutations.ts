/**
 * Loki fast paths that mutate project data — business plan generation and profile
 * update drafts. Called from the messages route before resolveCommand().
 */
import type { UserProject } from "@/db/schema";
import { proposeAction } from "@/db/queries/actions";
import { generateBusinessPlan } from "@/lib/business-plan";
import { ACTION_TYPE } from "@/lib/constants/statuses";
import {
  PROFILE_FIELD_LABELS,
  type ProfileUpdateRequest,
} from "@/lib/loki-fleet-commands";

function findProject(projects: UserProject[], projectKey: string): UserProject | undefined {
  const lower = projectKey.toLowerCase();
  return projects.find((p) => p.name.toLowerCase() === lower);
}

export type BusinessPlanOutcome =
  | {
      ok: true;
      projectKey: string;
      entityId: string;
      actionTitles: string[];
      planPreview: string;
    }
  | { ok: false; code: "no_project" | "no_entity" | "failed"; message: string };

export async function runLokiBusinessPlan(
  userId: string,
  projectKey: string | null,
  projects: UserProject[],
): Promise<BusinessPlanOutcome> {
  if (!projectKey) {
    return {
      ok: false,
      code: "no_project",
      message:
        "Which project should get the business plan? Select one on the right or name it (e.g. **generate business plan for fleetcrown**).",
    };
  }

  const project = findProject(projects, projectKey);
  if (!project?.entityProjectId) {
    return {
      ok: false,
      code: "no_entity",
      message: `Could not find a profile for **${projectKey}**. Open [Projects](/projects) and try again.`,
    };
  }

  try {
    const result = await generateBusinessPlan(userId, project.entityProjectId);
    if (!result) {
      return {
        ok: false,
        code: "failed",
        message: `Plan generation failed for **${project.name}** — try again in a moment.`,
      };
    }

    const preview = result.plan
      .replace(/^#+\s+/gm, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" · ")
      .slice(0, 280);

    return {
      ok: true,
      projectKey: project.name,
      entityId: project.entityProjectId,
      actionTitles: result.actions.map((a) => a.title),
      planPreview: preview,
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      code: "failed",
      message: `Plan generation failed for **${project.name}**: ${detail}`,
    };
  }
}

export function formatBusinessPlanReply(outcome: Extract<BusinessPlanOutcome, { ok: true }>): string {
  const actionLines =
    outcome.actionTitles.length > 0
      ? outcome.actionTitles.map((t) => `- ${t}`).join("\n")
      : "- (no actions returned)";

  return [
    `Generated a living business plan for **${outcome.projectKey}** (${outcome.actionTitles.length} action${outcome.actionTitles.length === 1 ? "" : "s"}).`,
    "",
    outcome.planPreview ? `**Preview:** ${outcome.planPreview}` : "",
    "",
    "**Next actions:**",
    actionLines,
    "",
    `Open the [project profile](/projects/${outcome.entityId}) to review its context and plan.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type ProfileUpdateOutcome =
  | { ok: true; projectKey: string; fieldLabel: string; duplicate: boolean }
  | { ok: false; code: "no_project" | "no_entity"; message: string };

export async function proposeLokiProfileUpdate(
  userId: string,
  projectKey: string | null,
  projects: UserProject[],
  update: ProfileUpdateRequest,
): Promise<ProfileUpdateOutcome> {
  if (!projectKey) {
    return {
      ok: false,
      code: "no_project",
      message:
        "Which project should I update? Select one on the right or name it (e.g. **set mission to … for fleetcrown**).",
    };
  }

  const project = findProject(projects, projectKey);
  if (!project?.entityProjectId) {
    return {
      ok: false,
      code: "no_entity",
      message: `Could not find a profile for **${projectKey}**. Open [Projects](/projects) to edit inline.`,
    };
  }

  const fieldLabel = PROFILE_FIELD_LABELS[update.fieldKey] ?? update.fieldKey;
  const title = `Update ${fieldLabel} on ${project.name}`;
  const preview =
    update.value.length > 200 ? `${update.value.slice(0, 197)}…` : update.value;

  const action = await proposeAction(userId, {
    type: ACTION_TYPE.OTHER,
    title,
    description: `${fieldLabel}: ${preview}`,
    entityId: project.entityProjectId,
    reasoning: "Proposed from Loki — approve to write the project profile.",
    payload: {
      kind: "profile_update",
      projectKey: project.name,
      fieldKey: update.fieldKey,
      value: update.value,
    },
  });

  return {
    ok: true,
    projectKey: project.name,
    fieldLabel,
    duplicate: action === null,
  };
}

export function formatProfileUpdateReply(outcome: Extract<ProfileUpdateOutcome, { ok: true }>): string {
  if (outcome.duplicate) {
    return [
      `A draft to update **${outcome.fieldLabel}** on **${outcome.projectKey}** is already waiting.`,
      "",
      "Review it on [Today](/today#actions) or open [Projects](/projects) to edit inline.",
    ].join("\n");
  }

  return [
    `Queued a draft to update **${outcome.fieldLabel}** on **${outcome.projectKey}**.`,
    "",
    "Review on [Today](/today#actions) — approve to apply, or edit directly in [Projects](/projects).",
  ].join("\n");
}
