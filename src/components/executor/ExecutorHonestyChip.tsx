import { cn } from "@/lib/utils";
import type { ExecutorHonestyLabel } from "@/lib/executor-honesty";

const KIND_CLASS: Record<ExecutorHonestyLabel["kind"], string> = {
  queued: "ui-executor-honesty-neutral",
  "needs-builder": "ui-executor-honesty-warning",
  "needs-github": "ui-executor-honesty-warning",
  "needs-gateway": "ui-executor-honesty-warning",
  "builder-starting": "ui-executor-honesty-positive",
};

/** Compact honesty label for dispatch / terminal actions. */
export function ExecutorHonestyChip({
  honesty,
  className,
}: {
  honesty: ExecutorHonestyLabel | null;
  className?: string;
}) {
  if (!honesty) return null;
  return (
    <span
      className={cn(KIND_CLASS[honesty.kind], className)}
      title={honesty.title}
    >
      {honesty.label}
    </span>
  );
}
