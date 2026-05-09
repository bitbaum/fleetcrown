import type { DevLogEntry } from "@/db/schema/user-projects";

export const HEALTH_STYLE: Record<string, string> = {
  good:              "ui-tag ui-tag-positive",
  "needs attention": "ui-tag ui-tag-warning",
  critical:          "ui-tag ui-tag-negative",
};

export function DevLogList({ entries }: { entries: DevLogEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => {
        const d = new Date(entry.date);
        const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const timeStr = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        const healthKey = (entry.health ?? "").toLowerCase();
        const healthCls = HEALTH_STYLE[healthKey] ?? "ui-tag ui-tag-neutral";
        return (
          <div key={i} className="rounded-xl border border-border-subtle bg-surface-base p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-text-muted">{dateStr} <span className="text-text-muted/60">{timeStr}</span></span>
              {entry.health && <span className={healthCls}>{entry.health}</span>}
            </div>
            {entry.done && (
              <p className="text-xs leading-relaxed text-text-secondary">
                <span className="font-medium text-text-tertiary">done </span>{entry.done}
              </p>
            )}
            {entry.next && (
              <p className="text-xs leading-relaxed text-text-primary">
                <span className="font-medium text-accent-text">→ </span>{entry.next}
              </p>
            )}
            {(entry.tests || entry.todos) && (
              <p className="text-[11px] text-text-muted">
                {[entry.tests, entry.todos ? `${entry.todos} TODOs` : ""].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
