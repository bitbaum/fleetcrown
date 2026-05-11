import { ProgressBar, getProgressTone } from "@/components/ui/progress-bar";
import { GOAL_PROGRESS_THRESHOLDS } from "@/config/ui";

export function GoalProgressBar({
  value,
  minPercent = 1,
  lowTone = "accent",
  className,
}: {
  value: number;
  minPercent?: number;
  lowTone?: "accent" | "neutral";
  className?: string;
}) {
  return (
    <ProgressBar
      value={value}
      minPercent={minPercent}
      tone={getProgressTone(value, {
        positiveAt: GOAL_PROGRESS_THRESHOLDS.healthyPct,
        warningAt: GOAL_PROGRESS_THRESHOLDS.cautionPct,
        lowTone,
      })}
      className={className}
    />
  );
}
