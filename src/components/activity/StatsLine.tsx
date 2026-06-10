import type { ProjectDigest } from "@/db/queries/digests";

// One-line tally that lives below the report. The previous version was a
// 6-card grid of giant numbers that read as decorative noise; the user
// called them out as feeling like "magic or bs". Counts are inline and
// secondary now — the LLM report above carries the meaning, this confirms
// it. Zero-value categories are hidden so the eye doesn't track noise.
export function StatsLine({ stats }: { stats: ProjectDigest["stats"] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-text-tertiary">
      <span><span className="text-text-secondary tabular-nums">{stats.promptsSent}</span> prompts</span>
      <span><span className="text-text-secondary tabular-nums">{stats.runsStarted}</span> runs</span>
      <span><span className="text-text-secondary tabular-nums">{stats.runsFinished}</span> finished</span>
      {stats.success > 0 && (
        <span><span className="text-status-positive tabular-nums">{stats.success}</span> success</span>
      )}
      {stats.partial > 0 && (
        <span><span className="text-status-warning tabular-nums">{stats.partial}</span> partial</span>
      )}
      {stats.error > 0 && (
        <span><span className="text-status-negative tabular-nums">{stats.error}</span> errors</span>
      )}
    </div>
  );
}
