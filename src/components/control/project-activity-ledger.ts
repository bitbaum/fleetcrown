import type { ProjectState } from "@/lib/control-types";
import type { ActivityItem } from "@/db/queries/prompt-history";

export type ProjectActivityEvent =
  | {
      id: string;
      kind: "user_prompt";
      occurredAt: number;
      title: string;
      body: string;
      /** Preset intent (e.g. "next_best", "test_fix") when no customPrompt
       *  was supplied, null for free-form user prompts. Lets the renderer
       *  distinguish at-a-glance which dispatches were templated vs typed. */
      intent: string | null;
    }
  | {
      id: string;
      kind: "git_commit";
      occurredAt: null;
      title: string;
      body: string;
    };

export function buildProjectActivityLedger({
  injections,
  git,
}: {
  injections: ActivityItem[];
  git: ProjectState["git"];
}): ProjectActivityEvent[] {
  const promptEvents: ProjectActivityEvent[] = injections.map((item) => {
    return {
      id: `prompt:${item.id}`,
      kind: "user_prompt",
      occurredAt: new Date(item.dispatchedAt).getTime(),
      title: "Sent prompt",
      body: item.displayText,
      intent: item.isCustom ? null : item.intent,
    };
  });

  const commitEvents: ProjectActivityEvent[] = (git?.recentCommits ?? []).map((commit, index) => {
    const colonIdx = commit.indexOf(": ");
    const title = colonIdx > 0 ? commit.slice(0, colonIdx) : "Commit";
    const body = colonIdx > 0 ? commit.slice(colonIdx + 2) : commit;
    return {
      id: `commit:${index}:${commit}`,
      kind: "git_commit",
      occurredAt: null,
      title,
      body,
    };
  });

  return [...promptEvents, ...commitEvents];
}
