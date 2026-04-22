/**
 * Shared badge components for project health display.
 * Used in both ProjectGrid cards and ProjectDetail panel.
 */

export function MaturityBar({ value }: { value: string }) {
  const match = value.match(/^(\d+)\/10/);
  const score = match ? parseInt(match[1]) : null;
  if (score === null) return <span className="text-white/50 text-xs">{value}</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`h-1 w-2 rounded-sm ${
              i < score
                ? score >= 8 ? "bg-emerald-500" : score >= 5 ? "bg-yellow-500" : "bg-red-500"
                : "bg-white/10"
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] text-white/30">{score}/10</span>
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const isProduction = v.includes("production") || v.includes("active");
  const isEarly = v.includes("early") || v.includes("planning") || v.includes("blueprint") || v.includes("pre-launch");
  const cls = isProduction
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : isEarly
    ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"
    : "bg-blue-500/15 text-blue-400 border-blue-500/25";
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium truncate max-w-[180px] ${cls}`}>
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

export function HealthBadge({ signal }: { signal: HealthSignal }) {
  const styles: Record<HealthSignal["kind"], string> = {
    security:   "bg-red-500/15 text-red-400 border-red-500/25",
    broken:     "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
    deployment: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  };
  const icons: Record<HealthSignal["kind"], string> = {
    security:   "🔒",
    broken:     "⚠",
    deployment: "🔸",
  };
  return (
    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${styles[signal.kind]}`}>
      <span>{icons[signal.kind]}</span>
      {signal.label}
    </span>
  );
}
