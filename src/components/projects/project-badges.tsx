import { ShieldAlert, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type HealthSignalKind = "security" | "broken" | "deployment";

export type HealthSignalConfig = {
  kind: HealthSignalKind;
  key: string;
  /** Short label for grid badges */
  label: string;
  /** Heading used in the detail panel issue card */
  cardLabel: string;
  icon: LucideIcon;
  /** className for the compact grid badge */
  badgeCls: string;
  /** classNames for the detail panel issue card */
  cardBorder: string;
  cardBg: string;
  cardText: string;
  cardBody: string;
};

/** Single source of truth for all project health signals. */
export const HEALTH_SIGNAL_CONFIG: HealthSignalConfig[] = [
  {
    kind: "security",
    key: "security_vulnerability",
    label: "Security risk",
    cardLabel: "Security Risk",
    icon: ShieldAlert,
    badgeCls: "bg-status-negative-subtle text-status-negative border-status-negative/25",
    cardBorder: "border-status-negative/25",
    cardBg: "bg-status-negative-subtle",
    cardText: "text-status-negative",
    cardBody: "text-status-negative/70",
  },
  {
    kind: "broken",
    key: "broken_features",
    label: "Broken",
    cardLabel: "Broken Features",
    icon: AlertTriangle,
    badgeCls: "bg-status-warning-subtle text-status-warning border-status-warning/25",
    cardBorder: "border-status-warning/25",
    cardBg: "bg-status-warning-subtle",
    cardText: "text-status-warning",
    cardBody: "text-status-warning/70",
  },
  {
    kind: "deployment",
    key: "deployment_issue",
    label: "Deploy issue",
    cardLabel: "Deployment Issue",
    icon: AlertTriangle,
    badgeCls: "bg-status-warning-subtle text-status-warning border-status-warning/25",
    cardBorder: "border-status-warning/25",
    cardBg: "bg-status-warning-subtle",
    cardText: "text-status-warning",
    cardBody: "text-status-warning/70",
  },
];

export type HealthSignal = {
  kind: HealthSignalKind;
  label: string;
};

export function getHealthSignals(attrs: Record<string, string>): HealthSignal[] {
  const signals: HealthSignal[] = [];
  for (const cfg of HEALTH_SIGNAL_CONFIG) {
    if (!attrs[cfg.key]) continue;
    if (cfg.kind === "broken") {
      const count = attrs[cfg.key].split(",").length;
      signals.push({ kind: cfg.kind, label: `${count} broken feature${count > 1 ? "s" : ""}` });
    } else {
      signals.push({ kind: cfg.kind, label: cfg.label });
    }
  }
  return signals;
}

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

export function HealthBadge({ signal }: { signal: HealthSignal }) {
  const cfg = HEALTH_SIGNAL_CONFIG.find((c) => c.kind === signal.kind)!;
  const Icon = cfg.icon;
  return (
    <span className={`ui-micro-badge gap-1 ${cfg.badgeCls}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {signal.label}
    </span>
  );
}
