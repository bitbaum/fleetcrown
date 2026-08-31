import Link from "next/link";
import { activityHref } from "./activity-shared";
import type { DigestWindow } from "@/db/queries/digests";

// Surfaced under the empty state so the page never lies that there's "nothing"
// when the user has a real history just outside the current window. All
// presentational fields are precomputed by the caller (purity rule — no
// Date.now() in render).
export function EmptyLookback({
  ageLabel,
  latestPromptProject,
  totalPrompts,
  distinctProjects,
  suggestedWindow,
  suggestionLabel,
}: {
  ageLabel: string;
  latestPromptProject: string | null;
  totalPrompts: number;
  distinctProjects: number;
  suggestedWindow: DigestWindow;
  /** When null the link is hidden — clicking would be a no-op. */
  suggestionLabel: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
      <span>
        Last activity <span className="text-text-secondary">{ageLabel}</span>
        {latestPromptProject && (
          <>
            {" "}
            on <span className="text-text-secondary">{latestPromptProject}</span>
          </>
        )}
      </span>
      <span>·</span>
      <span>
        <span className="text-text-secondary tabular-nums">{totalPrompts}</span> prompts total
        across <span className="text-text-secondary tabular-nums">{distinctProjects}</span> projects
      </span>
      {suggestionLabel && (
        <>
          <span>·</span>
          <Link
            href={activityHref({ window: suggestedWindow })}
            className="text-accent-primary hover:underline"
          >
            {suggestionLabel}
          </Link>
        </>
      )}
    </div>
  );
}
