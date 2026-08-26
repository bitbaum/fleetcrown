"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import type { ProjectHealth, ProjectHealthCheck } from "@/lib/project-health";
import { describeProjectHealth } from "@/lib/project-health";
import { setAttr, removeAttr } from "@/lib/api/attrs";
import { patchJson } from "@/lib/api/fetch";

function scoreTone(score: number, max: number) {
  const ratio = score / max;
  return ratio >= 0.8 ? "positive" : ratio >= 0.5 ? "warning" : "negative";
}

/**
 * The derived-score chip and its worklist.
 *
 * Ten named checks (src/lib/project-health.ts), one point each, so "why 6 and
 * not 7" is always answerable. Two earlier versions of this were still not
 * useful, for two different reasons:
 *
 *  1. Ten unlabelled ticks and a bare "6/10". Six of ten *what* was answerable
 *     only by hovering a `title` — which does not exist on a touch screen.
 *  2. Naming the gaps, but nothing more. "Mission stated ✗ — state the mission
 *     in Context" still means: find the tab, find the field, type. That is most
 *     of the work, and a number you cannot move is a number you learn to skip.
 *
 * So the panel performs the write. Each failing check opens its own field right
 * here and saves through the API that owns it; the score moves as you go. Each
 * check also states its exact rule, including the keyword list behind the one
 * rule nobody could guess (definition of done). Passing checks fold away —
 * they are the part you are done with.
 */
export function HealthScoreBar({
  health,
  interactive = false,
  projectId,
  userProjectId,
}: {
  health: ProjectHealth;
  interactive?: boolean;
  /** Required for the worklist to write. Without it the panel stays read-only. */
  projectId?: string;
  /** Row on user_projects — the home of the live_url column the Live URL
   *  check's fix writes. Absent for a project with no catalog row; the fix
   *  then falls back to the production_url attr, which the check also reads. */
  userProjectId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Checks earned in this session — the score moves before the page refetches. */
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) setEditing(null);
        else setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, editing]);

  // A saved check counts immediately. The server refresh that follows will
  // recompute the same thing, but a score that only moves after a round trip
  // reads as "nothing happened" — which is the exact complaint this answers.
  const checks = useMemo(
    () => health.checks.map((c) => (earned.has(c.key) ? { ...c, pass: true } : c)),
    [health.checks, earned],
  );
  const score = checks.filter((c) => c.pass).length;
  const tone = scoreTone(score, health.max);
  const missing = health.max - score;
  const failing = checks.filter((c) => !c.pass);
  const passing = checks.filter((c) => c.pass);
  const canEdit = interactive && Boolean(projectId);

  async function save(check: ProjectHealthCheck) {
    const value = draft.trim();
    if (!value && check.fix.kind !== "clear") return;
    setSaving(check.key);
    setError(null);
    try {
      const base = `/api/projects/${projectId}`;
      const res =
        check.fix.kind === "description"
          ? await patchJson(base, { description: value })
          : check.fix.kind === "clear"
            ? await removeAttr(base, check.fix.attr)
            : check.fix.kind === "liveUrl"
              ? userProjectId
                ? await patchJson("/api/atlas/site", { projectId: userProjectId, liveUrl: value })
                : await setAttr(base, "production_url", value)
              : await setAttr(base, check.fix.attr, value);
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || body.ok === false) throw new Error(body.error ?? "Could not save");
      setEarned((prev) => new Set(prev).add(check.key));
      setEditing(null);
      setDraft("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  }

  const bar = (
    <span className="ui-health-track" aria-hidden>
      {checks.map((check) => (
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
        {score}/{health.max}
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
        aria-label={`Health ${score} of ${health.max}${missing > 0 ? `, ${missing} outstanding` : ""} — show the breakdown`}
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
          <p className="ui-micro-label">Health · {score} of {health.max}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            Ten facts about this project, one point each. Nothing is estimated —
            each point is a field that is either filled in or not.
          </p>

          {missing === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-xs font-medium text-status-positive">
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> All ten. Nothing outstanding.
            </p>
          ) : (
            <>
              <p className="ui-health-group-label">{missing} to earn</p>
              <ul className="space-y-1">
                {failing.map((check) => {
                  const isEditing = editing === check.key;
                  const isSaving = saving === check.key;
                  return (
                    <li key={check.key} className="ui-health-row">
                      <div className="flex items-start gap-2">
                        <X className="mt-0.5 h-3 w-3 shrink-0 text-status-negative" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-text-primary">{check.label}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{check.detail}</p>
                          <p className="ui-health-rule">{check.rule}</p>
                        </div>
                      </div>

                      {!canEdit ? null : isEditing ? (
                        <div className="mt-2 space-y-2">
                          {check.fix.kind === "clear" ? (
                            <p className="text-xs leading-relaxed text-text-secondary">
                              Clearing this says the problem is resolved. It earns the
                              point and removes the flag from the project.
                            </p>
                          ) : check.fix.multiline ? (
                            <textarea
                              autoFocus
                              rows={3}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder={check.fix.placeholder}
                              className="ui-input w-full"
                            />
                          ) : (
                            <input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void save(check);
                              }}
                              placeholder={check.fix.placeholder}
                              className="ui-input w-full"
                            />
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void save(check)}
                              disabled={isSaving || (check.fix.kind !== "clear" && !draft.trim())}
                              className="ui-btn-save disabled:opacity-40"
                            >
                              {isSaving ? <Loader2 className="ui-spinner-xs" /> : check.fix.kind === "clear" ? "Mark resolved" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditing(null); setError(null); }}
                              className="ui-btn-text-cancel"
                            >
                              Cancel
                            </button>
                          </div>
                          {error && <p className="ui-error-xs">{error}</p>}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditing(check.key); setDraft(""); setError(null); }}
                          className="ui-health-fix-btn"
                        >
                          {check.fix.kind === "clear" ? "Mark resolved" : "Fix this"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {passing.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="ui-health-done-toggle"
                aria-expanded={showDone}
              >
                <Check className="h-3 w-3 shrink-0 text-status-positive" aria-hidden />
                {passing.length} already earned
                <ChevronDown
                  aria-hidden
                  className={`h-3 w-3 shrink-0 transition-transform ${showDone ? "rotate-180" : ""}`}
                />
              </button>
              {showDone && (
                <ul className="mt-1 space-y-1.5">
                  {passing.map((check) => (
                    <li key={check.key} className="flex items-start gap-2 text-xs">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-status-positive" aria-hidden />
                      <span className="min-w-0">
                        <span className="text-text-secondary">{check.label}</span>
                        <span className="block truncate text-text-muted">{check.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
