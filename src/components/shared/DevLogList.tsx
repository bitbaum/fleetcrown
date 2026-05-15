import type { DevLogEntry } from "@/db/schema/user-projects";
import { HEALTH_TAG_STYLE } from "@/config/ui";
import { APP_LOCALE } from "@/lib/constants";

export function DevLogList({ entries }: { entries: DevLogEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => {
        const d = new Date(entry.date);
        const dateStr = d.toLocaleDateString(APP_LOCALE, { month: "short", day: "numeric" });
        const timeStr = d.toLocaleTimeString(APP_LOCALE, { hour: "2-digit", minute: "2-digit" });
        const healthKey = (entry.health ?? "").toLowerCase();
        const healthCls = HEALTH_TAG_STYLE[healthKey] ?? "ui-tag ui-tag-neutral";
        return (
          <div key={i} className="ui-panel p-3 space-y-1.5">
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
              <p className="text-xs text-text-muted">
                {[entry.tests, entry.todos ? `${String(entry.todos).replace(/\s*TODOs?\s*$/i, "").trim()} TODOs` : ""].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
