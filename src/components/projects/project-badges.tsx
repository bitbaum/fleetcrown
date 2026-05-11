/**
 * Shared badge components for project health display.
 * Used in both ProjectGrid cards and ProjectDetail panel.
 */

export function MaturityBar({ value }: { value: string }) {
  const match = value.match(/^(\d+)\/10/);
  const score = match ? parseInt(match[1]) : null;
  if (score === null) return <span className="text-text-secondary text-xs">{value}</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`h-1 w-2 rounded-sm ${
              i < score
                ? score >= 8 ? "bg-status-positive" : score >= 5 ? "bg-status-warning" : "bg-status-negative"
                : "bg-surface-overlay"
            }`}
          />
        ))}
      </div>
      <span className="text-micro text-text-tertiary">{score}/10</span>
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const isProduction = v.includes("production") || v.includes("active");
  const isEarly = v.includes("early") || v.includes("planning") || v.includes("blueprint") || v.includes("pre-launch");
  const cls = isProduction
    ? "bg-status-positive-subtle text-status-positive border-status-positive/25"
    : isEarly
    ? "bg-status-warning-subtle text-status-warning border-status-warning/25"
    : "bg-accent-muted text-accent-text border-accent-primary/25";
  return (
    <span className={`ui-micro-badge truncate max-w-[180px] ${cls}`} title={value}>
      {value}
    </span>
  );
}

export type HealthSignal = {
  kind: "security" | "broken" | "deployment";
  label: string;
};

/** Extract health signals from a project's attrs map */
export function getHealthSignals(attrs: Record<string, string>): HealthSignal[] {
  const signals: HealthSignal[] = [];
  if (attrs["security_vulnerability"]) signals.push({ kind: "security", label: "Security risk" });
  if (attrs["broken_features"]) {
    const count = attrs["broken_features"].split(",").length;
    signals.push({ kind: "broken", label: `${count} broken feature${count > 1 ? "s" : ""}` });
  }
  if (attrs["deployment_issue"]) signals.push({ kind: "deployment", label: "Deploy issue" });
  return signals;
}

const HEALTH_BADGE_STYLE: Record<HealthSignal["kind"], string> = {
  security:   "bg-status-negative-subtle text-status-negative border-status-negative/25",
  broken:     "bg-status-warning-subtle text-status-warning border-status-warning/25",
  deployment: "bg-status-warning-subtle text-status-warning border-status-warning/25",
};

const HEALTH_BADGE_ICON: Record<HealthSignal["kind"], string> = {
  security:   "🔒",
  broken:     "⚠",
  deployment: "🔸",
};

export function HealthBadge({ signal }: { signal: HealthSignal }) {
  return (
    <span className={`ui-micro-badge gap-1 ${HEALTH_BADGE_STYLE[signal.kind]}`}>
      <span>{HEALTH_BADGE_ICON[signal.kind]}</span>
      {signal.label}
    </span>
  );
}
