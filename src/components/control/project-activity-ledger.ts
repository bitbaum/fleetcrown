import type { ProjectState } from "@/lib/control-types";
import type { ProjectActivityEvent as UnifiedActivityEvent } from "@/db/queries/activity";

export type ProjectActivityEvent =
  | {
      id: string;
      kind: "user_prompt";
      occurredAt: number;
      title: string;
      body: string;
      intent: string | null;
    }
  | {
      id: string;
      kind: "run_outcome";
      occurredAt: number;
      title: string;
      body: string;
      status: UnifiedActivityEvent["status"];
    }
  | {
      id: string;
      kind: "git_commit";
      occurredAt: null;
      title: string;
      body: string;
    }
  | {
      id: string;
      kind: "signal";
      occurredAt: number;
      title: string;
      body: string;
      status: UnifiedActivityEvent["status"];
    };

function unifiedToLedger(ev: UnifiedActivityEvent): ProjectActivityEvent | null {
  const at = Date.parse(ev.at);
  if (ev.kind === "dispatch") {
    return {
      id: ev.id,
      kind: "user_prompt",
      occurredAt: at,
      title: ev.title,
      body: ev.detail ?? ev.title,
      intent: ev.intent,
    };
  }
  if (ev.kind === "task_completed" || ev.kind === "task_failed") {
    return {
      id: ev.id,
      kind: "run_outcome",
      occurredAt: at,
      title: ev.title,
      body: ev.detail ?? ev.title,
      status: ev.status,
    };
  }
  if (ev.kind === "input_requested" || ev.kind === "session_closed") {
    return {
      id: ev.id,
      kind: "signal",
      occurredAt: at,
      title: ev.title,
      body: ev.detail ?? ev.title,
      status: ev.status,
    };
  }
  return null;
}

export function buildProjectActivityLedger({
  activity,
  git,
}: {
  activity: UnifiedActivityEvent[];
  git: ProjectState["git"];
}): ProjectActivityEvent[] {
  const timeline = activity
    .map(unifiedToLedger)
    .filter((ev): ev is ProjectActivityEvent => ev !== null)
    .sort((a, b) => {
      const aAt = a.occurredAt ?? 0;
      const bAt = b.occurredAt ?? 0;
      return bAt - aAt;
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

  return [...timeline, ...commitEvents];
}

/** One-line summary for Control table / live tab rows. */
export function latestActivitySummary(activity: UnifiedActivityEvent[]): string | null {
  const first = activity[0];
  if (!first) return null;
  return first.title;
}
