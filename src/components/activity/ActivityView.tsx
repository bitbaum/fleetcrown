import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getActivitySnapshot, getProjectDigest } from "@/db/queries/digests";
import { DigestPanel } from "./DigestPanel";
import { StatusStrip } from "./StatusStrip";
import { FilterCard } from "./FilterCard";
import { EventStream } from "./EventStream";
import { StatsLine } from "./StatsLine";
import { EmptyLookback } from "./EmptyLookback";
import { RANGE_LABEL, normalizeDensity } from "./activity-shared";

// The single composing view for /activity. Server component — all data comes
// from getProjectDigest, no client fetch. Sub-views (StatusStrip, FilterCard,
// EventStream, StatsLine) own their own layout; this just orders them.
export async function ActivityView({
  userId,
  window,
  project,
  density: densityParam,
}: {
  userId: string;
  window?: string;
  project?: string;
  density?: string;
}) {
  const [digest, snapshot] = await Promise.all([
    getProjectDigest(userId, { window, projectKey: project }),
    getActivitySnapshot(userId),
  ]);
  const density = normalizeDensity(densityParam);
  const hasActivity = digest.timeline.length > 0;
  const inactiveProjects = digest.projects.filter((p) => p.activity === 0);

  return (
    <div className="space-y-5">
      <StatusStrip
        digestWindow={digest.window}
        projectKey={digest.projectKey}
        density={density}
        statuses={digest.projectStatuses}
        inactiveProjects={inactiveProjects}
      />

      <FilterCard
        digestWindow={digest.window}
        projectKey={digest.projectKey}
        density={density}
        since={digest.since}
      />

      {!hasActivity ? (
        <Card className="space-y-4">
          <EmptyState icon={FileText} title={`No activity in ${RANGE_LABEL[digest.window]}`}>
            Dispatch prompts or finish agent runs, then return here. Or pick a wider window above.
          </EmptyState>
          {snapshot.latestPromptAt && snapshot.totalPrompts > 0 && (() => {
            const ageMs = Date.parse(digest.until) - Date.parse(snapshot.latestPromptAt);
            const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
            const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
            const ageLabel =
              ageDays >= 1 ? `${ageDays} day${ageDays === 1 ? "" : "s"} ago`
              : ageHours >= 1 ? `${ageHours} hour${ageHours === 1 ? "" : "s"} ago`
              : "a moment ago";
            const suggestedWindow =
              ageHours < 1 ? "hour" as const
              : ageHours < 24 ? "day" as const
              : ageDays < 7 ? "week" as const
              : "month" as const;
            // Pick the label that describes what clicking actually changes:
            // - same window + filtered to a project → clearing the project
            // - different window (regardless of filter) → switching window
            // - same window + no project filter → no useful action, skip the link
            const windowChanged = suggestedWindow !== digest.window;
            const projectCleared = digest.projectKey !== null;
            let suggestionLabel: string | null = null;
            if (windowChanged) suggestionLabel = `Show ${RANGE_LABEL[suggestedWindow]}`;
            else if (projectCleared) suggestionLabel = "Show all projects";
            return (
              <EmptyLookback
                ageLabel={ageLabel}
                latestPromptProject={snapshot.latestPromptProject}
                totalPrompts={snapshot.totalPrompts}
                distinctProjects={snapshot.distinctProjects}
                suggestedWindow={suggestedWindow}
                suggestionLabel={suggestionLabel}
                density={density}
              />
            );
          })()}
        </Card>
      ) : (
        <>
          {/* Facts first: counts, then the raw time-ordered events. The AI
              narrative is an optional summary at the bottom — handy, but never
              the source of truth (the user reported it read as vague filler). */}
          <StatsLine stats={digest.stats} />
          <EventStream items={digest.timeline} density={density} />
          <DigestPanel window={digest.window} project={digest.projectKey} />
        </>
      )}
    </div>
  );
}
