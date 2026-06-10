import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DigestProjectOption, DigestWindow, ProjectStatus } from "@/db/queries/digests";
import { activityHref, STATUS_DOT_CLASS, type Density } from "./activity-shared";

// At-a-glance row: every project with activity, colored by its worst event in
// the window. The projects that need attention sort leftmost. "+ N quiet"
// reveals projects with no events in the window.
export function StatusStrip({
  digestWindow,
  projectKey,
  density,
  statuses,
  inactiveProjects,
}: {
  digestWindow: DigestWindow;
  projectKey: string | null;
  density: Density;
  statuses: ProjectStatus[];
  inactiveProjects: DigestProjectOption[];
}) {
  if (statuses.length === 0 && projectKey === null) return null;
  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={activityHref({ window: digestWindow, project: null, density })}
          className={cn("ui-chip-filter", projectKey === null && "ui-chip-filter-active")}
        >
          All projects
        </Link>
        <span className="mx-1 text-text-tertiary">·</span>
        {statuses.map((s) => (
          <Link
            key={s.key}
            href={activityHref({ window: digestWindow, project: s.key, density })}
            className={cn(
              "ui-chip-filter inline-flex items-center gap-1.5",
              projectKey === s.key && "ui-chip-filter-active",
            )}
            title={statusTooltip(s)}
          >
            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT_CLASS[s.worst])} aria-hidden />
            {s.label}
            <span className="text-text-tertiary">{s.total}</span>
          </Link>
        ))}
        {statuses.length === 0 && projectKey !== null && (
          <span className="text-xs text-text-tertiary">
            {projectKey} has no activity in this window
          </span>
        )}
      </div>
      {inactiveProjects.length > 0 && (
        <details className="group">
          <summary className="ui-kicker cursor-pointer text-text-tertiary hover:text-text-secondary list-none">
            <span className="group-open:hidden">+ {inactiveProjects.length} quiet</span>
            <span className="hidden group-open:inline">Hide quiet projects</span>
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {inactiveProjects.map((p) => (
              <Link
                key={p.key}
                href={activityHref({ window: digestWindow, project: p.key, density })}
                className={cn("ui-chip-filter", projectKey === p.key && "ui-chip-filter-active")}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

function statusTooltip(s: ProjectStatus): string {
  const parts: string[] = [];
  if (s.errors) parts.push(`${s.errors} error${s.errors === 1 ? "" : "s"}`);
  if (s.warning) parts.push(`${s.warning} in flight / partial`);
  if (s.success) parts.push(`${s.success} succeeded`);
  return parts.length > 0 ? parts.join(" · ") : `${s.total} event${s.total === 1 ? "" : "s"}`;
}
