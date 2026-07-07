"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/db/queries/prompt-history";
import { useEventStream, useFilteredChangeHandler } from "@/lib/event-stream";
import {
  TABLE_PROJECT_STATES,
  TABLE_PENDING_COMMANDS,
  TABLE_ORCHESTRATION_RUNS,
} from "@/lib/event-stream-types";
import { EmptyState } from "@/components/ui/empty-state";
import { Columns2 } from "lucide-react";
import { DuetPane } from "./DuetPane";

type PaneInit = { projectKey: string | null; prompt: ActivityItem | null };

/**
 * The Duet watch surface: two panes, each showing one agent's last prompt,
 * kept live off a single bridge SSE connection. Every dispatch mirrors into
 * project_states (which the bridge notifies on), so a new prompt on either
 * side produces an event → a coalesced `tick` bump → both panes refetch their
 * current project. Read-only: this watches the existing prompt SSOT, so any
 * dispatch source (human, autopilot, or a future agent-to-agent relay) shows
 * up here for free.
 */
export function DuetView({
  projects,
  initial,
}: {
  projects: string[];
  initial: { a: PaneInit; b: PaneInit };
}) {
  const [keyA, setKeyA] = useState(initial.a.projectKey);
  const [keyB, setKeyB] = useState(initial.b.projectKey);
  const [tick, setTick] = useState(0);

  // Coalesce bursts (a run state machine touches several rows in a row) into a
  // single refresh, and bump `tick` so both panes refetch their live prompt.
  const coalesce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handler = useFilteredChangeHandler({
    tables: [TABLE_PROJECT_STATES, TABLE_PENDING_COMMANDS, TABLE_ORCHESTRATION_RUNS],
    onChange: () => {
      if (coalesce.current) clearTimeout(coalesce.current);
      coalesce.current = setTimeout(() => setTick((t) => t + 1), 200);
    },
  });
  const streamState = useEventStream({ onChange: handler });
  const live = streamState.mode === "connected";

  if (projects.length === 0) {
    return (
      <EmptyState icon={Columns2} title="No projects to watch">
        Register projects in Control, then come back to watch two agents side by side.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className={cn(live ? "ui-dot-positive" : "ui-dot-warning")} />
        <span className="ui-micro-label">
          {live ? "Live" : streamState.mode === "reconnecting" ? "Reconnecting…" : "Connecting…"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <DuetPane
          label="Agent A"
          projects={projects}
          projectKey={keyA}
          initialPrompt={initial.a.prompt}
          tick={tick}
          onSelectProject={setKeyA}
        />
        <DuetPane
          label="Agent B"
          projects={projects}
          projectKey={keyB}
          initialPrompt={initial.b.prompt}
          tick={tick}
          onSelectProject={setKeyB}
        />
      </div>
    </div>
  );
}
