import { cn } from "@/lib/utils";

type ProgressTone = "neutral" | "accent" | "positive" | "warning" | "negative";

const TONE_CLASS: Record<ProgressTone, string> = {
  neutral: "bg-status-neutral",
  accent: "bg-accent-primary",
  positive: "bg-status-positive",
  warning: "bg-status-warning",
  negative: "bg-status-negative",
};

export function getProgressTone(
  value: number,
  thresholds: {
    positiveAt?: number;
    warningAt?: number;
    negativeAt?: number;
    lowTone?: ProgressTone;
  } = {},
): ProgressTone {
  const {
    positiveAt,
    warningAt,
    negativeAt,
    lowTone = "accent",
  } = thresholds;

  if (negativeAt !== undefined && value >= negativeAt) return "negative";
  if (positiveAt !== undefined && value >= positiveAt) return "positive";
  if (warningAt !== undefined && value >= warningAt) return "warning";
  return lowTone;
}

export function ProgressBar({
  value,
  minPercent = 0,
  tone = "accent",
  className,
  indicatorClassName,
}: {
  value: number;
  minPercent?: number;
  tone?: ProgressTone;
  className?: string;
  indicatorClassName?: string;
}) {
  const bounded = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const width = bounded === 0 ? 0 : Math.max(bounded, minPercent);

  return (
    <div className={cn("overflow-hidden rounded-full bg-surface-overlay", className)}>
      <div
        className={cn("h-full rounded-full transition-all", TONE_CLASS[tone], indicatorClassName)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
