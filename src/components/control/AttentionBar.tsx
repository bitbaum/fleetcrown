"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { AttentionItem } from "./control-presenter";
import type { FailedCommand } from "@/lib/control-types";
import { HEALTH_TAG_STYLE } from "@/config/ui";
import { timeAgo } from "@/lib/dates";

export function AttentionBar({
  items,
  failedCommands,
}: {
  items: AttentionItem[];
  failedCommands?: FailedCommand[];
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("control:dismissed-failures");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      try { localStorage.setItem("control:dismissed-failures", JSON.stringify([...next])); } catch { /* */ }
      return next;
    });
  };

  const visibleFailures = (failedCommands ?? []).filter((f) => !dismissed.has(f.id));

  if (items.length === 0 && visibleFailures.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-base px-4 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-status-warning" />
          <div className="flex flex-wrap gap-2 min-w-0">
            <span className="text-xs text-text-secondary font-medium shrink-0 mt-0.5">Needs attention:</span>
            {items.map(({ project, reason }) => {
              const healthKey = (project.session?.health ?? project.latestOrchestrationRun?.summary?.health ?? "").toLowerCase();
              const tagCls = HEALTH_TAG_STYLE[healthKey] ?? "ui-tag ui-tag-warning";
              return (
                <span key={project.tab} className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-medium text-text-primary">{project.tab}</span>
                  {reason && <span className={tagCls}>{reason}</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {visibleFailures.map((f) => (
        <div key={f.id} className="flex items-start justify-between gap-3 rounded-xl border border-status-negative/30 bg-status-negative-subtle px-4 py-2.5">
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-status-negative" />
            <span className="text-xs text-text-primary">
              <span className="font-medium">{f.type}</span>
              {f.tab !== "unknown" && <> → <span className="font-medium">{f.tab}</span></>}
              {" failed: "}
              <span className="text-text-secondary">{f.error}</span>
              <span className="ml-2 text-text-muted">{timeAgo(new Date(f.executedAt).getTime())}</span>
            </span>
          </div>
          <button
            onClick={() => dismiss(f.id)}
            className="shrink-0 text-text-muted hover:text-text-secondary transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
