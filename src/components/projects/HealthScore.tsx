"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import type { ProjectHealth } from "@/lib/project-health";
import { describeProjectHealth } from "@/lib/project-health";

function scoreTone(score: number, max: number) {
  const ratio = score / max;
  return ratio >= 0.8 ? "positive" : ratio >= 0.5 ? "warning" : "negative";
}

/**
 * The derived-score chip. Ten named checks (src/lib/project-health.ts), one
 * point each, so "why 6 and not 7" is always answerable.
 *
 * It used to render as ten unlabelled tick marks and a bare "6/10". Six of
 * ten *what* was answerable only by hovering for a `title` tooltip — which
 * does not exist on a touch screen, where this is a header element on the
 * project page. A number with no noun, no unit and no reachable explanation
 * reads as magic, so people learn to ignore it.
 *
 * Now: the word "Health", the score, how many checks are outstanding, and a
 * chevron saying the breakdown opens. The segments stay because the model
 * really is ten discrete facts rather than a percentage — but they are no
 * longer the only thing on screen.
 */
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

  const tone = scoreTone(health.score, health.max);
  const missing = health.max - health.score;

  const bar = (
    <span className="ui-health-track" aria-hidden>
      {health.checks.map((check) => (
        <span
          key={check.key}
          className={check.pass ? `ui-health-seg ui-health-seg-${tone}` : "ui-health-seg"}
        />
      ))}
    </span>
  );

  const readout = (
    <>
      <span className="ui-health-label">Health</span>
      {bar}
      <span className="ui-health-score">
        {health.score}/{health.max}
      </span>
    </>
  );

  if (!interactive) {
    return (
      <span className="ui-health-chip" title={describeProjectHealth(health)}>
        {readout}
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ui-health-chip ui-health-chip-interactive"
        aria-expanded={open}
        aria-label={`Health ${health.score} of ${health.max}${missing > 0 ? `, ${missing} outstanding` : ""} — show the breakdown`}
      >
        {readout}
        {/* The count, not just the ratio: "4 to do" is the sentence a person
            acts on; "6/10" is one they have to translate first. */}
        {missing > 0 && <span className="ui-health-missing">{missing} to do</span>}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="ui-health-panel">
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
                  {/* The failing checks carry the action that earns the point,
                      so they must not be clipped to one line — that is the
                      whole payload of opening this. */}
                  <span className={check.pass ? "block truncate text-text-muted" : "block text-text-muted"}>
                    {check.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
