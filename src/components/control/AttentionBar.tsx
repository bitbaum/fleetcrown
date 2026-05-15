"use client";

import { AlertTriangle } from "lucide-react";
import type { AttentionItem } from "./control-presenter";
import { HEALTH_TAG_STYLE } from "@/config/ui";

export function AttentionBar({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-base px-4 py-2.5">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-status-warning" />
      <div className="flex flex-wrap gap-2 min-w-0">
        <span className="text-xs text-text-secondary font-medium shrink-0 mt-0.5">Needs attention:</span>
        {items.map(({ project, reason }) => {
          const healthKey = (project.session?.health ?? project.latestOrchestrationRun?.summary?.health ?? "").toLowerCase();
          const tagCls = HEALTH_TAG_STYLE[healthKey] ?? "ui-tag ui-tag-warning";
          const label = project.tab;
          return (
            <span key={project.tab} className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-medium text-text-primary">{label}</span>
              {reason && <span className={tagCls}>{reason}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
