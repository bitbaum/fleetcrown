import { ShieldAlert, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HEALTH_SIGNAL_BASE } from "./project-detail-types";
import type { HealthSignalBase, HealthSignalKind } from "./project-detail-types";

export type { HealthSignalKind };

export type HealthSignalConfig = HealthSignalBase & { icon: LucideIcon };

const KIND_ICON: Record<HealthSignalKind, LucideIcon> = {
  security: ShieldAlert,
  broken: AlertTriangle,
  deployment: AlertTriangle,
};

/** HEALTH_SIGNAL_BASE + Lucide icons. Add new signals in project-detail-types.ts only. */
export const HEALTH_SIGNAL_CONFIG: HealthSignalConfig[] = HEALTH_SIGNAL_BASE.map((s) => ({
  ...s,
  icon: KIND_ICON[s.kind],
}));

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

const STATUS_COLOR_MAP: Record<string, string> = {
  active:        "bg-status-positive-subtle text-status-positive border-status-positive/25",
  production:    "bg-status-positive-subtle text-status-positive border-status-positive/25",
  live:          "bg-status-positive-subtle text-status-positive border-status-positive/25",
  launched:      "bg-status-positive-subtle text-status-positive border-status-positive/25",
  planning:      "bg-status-warning-subtle text-status-warning border-status-warning/25",
  "pre-launch":  "bg-status-warning-subtle text-status-warning border-status-warning/25",
  blueprint:     "bg-status-warning-subtle text-status-warning border-status-warning/25",
  early:         "bg-status-warning-subtle text-status-warning border-status-warning/25",
  "in-progress": "bg-accent-muted text-accent-text border-accent-primary/25",
  development:   "bg-accent-muted text-accent-text border-accent-primary/25",
  paused:        "bg-surface-raised text-text-muted border-border-default",
  archived:      "bg-surface-raised text-text-muted border-border-default",
  deprecated:    "bg-surface-raised text-text-muted border-border-default",
};

export function StatusBadge({ value }: { value: string }) {
  const cls = STATUS_COLOR_MAP[value.toLowerCase()] ?? "bg-surface-raised text-text-tertiary border-border-subtle";
  // ui-micro-badge is inline-flex; truncate on the outer text node won't add
  // an ellipsis because flex layout doesn't apply text-overflow to anonymous
  // children. Wrap the text in a real span so truncate has a block-like
  // target. Spotted live on Projects mobile: a status like "Strategic
  // planning only - no code, n…" was cutting mid-word with no ellipsis,
  // making the chip look broken.
  return (
    <span className={`ui-micro-badge max-w-[180px] overflow-hidden ${cls}`} title={value}>
      <span className="truncate">{value}</span>
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
