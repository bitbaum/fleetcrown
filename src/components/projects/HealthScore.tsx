"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { ProjectHealth } from "@/lib/project-health";
import { describeProjectHealth } from "@/lib/project-health";

function scoreColor(score: number, max: number) {
  const ratio = score / max;
  return ratio >= 0.8 ? "bg-status-positive" : ratio >= 0.5 ? "bg-status-warning" : "bg-status-negative";
}

/** The derived-score bar. Same dots as the old MaturityBar, but the number is
 *  computed from named checks — click (interactive) opens the breakdown that
 *  answers "why N and not N+1". */
export function HealthScoreBar({
  health,
  interactive = false,
}: {
  health: ProjectHealth;
  interactive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const bar = (
    <>
      <div className="flex gap-0.5">
        {health.checks.map((check) => (
          <div
            key={check.key}
            className={`h-1 w-2 rounded-sm ${check.pass ? scoreColor(health.score, health.max) : "bg-surface-overlay"}`}
          />
        ))}
      </div>
      <span className="text-xs text-text-tertiary">{health.score}/{health.max}</span>
    </>
  );

  if (!interactive) {
    return (
      <div className="flex items-center gap-1.5" title={describeProjectHealth(health)}>
        {bar}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-surface-raised sm:min-h-8"
        title="Health score — click for the breakdown"
        aria-expanded={open}
        aria-label={`Health ${health.score} of ${health.max} — show breakdown`}
      >
        {bar}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[85vw] rounded-lg border border-border-default bg-surface-overlay p-3 shadow-panel-strong">
          <p className="ui-micro-label mb-2">Health — one point per fact</p>
          <ul className="space-y-1.5">
            {health.checks.map((check) => (
              <li key={check.key} className="flex items-start gap-2 text-xs">
                {check.pass ? (
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-status-positive" aria-hidden="true" />
                ) : (
                  <X className="mt-0.5 h-3 w-3 shrink-0 text-status-negative" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className={check.pass ? "text-text-secondary" : "font-medium text-text-primary"}>
                    {check.label}
                  </span>
                  <span className="block truncate text-text-muted" title={check.detail}>{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
