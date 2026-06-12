"use client";

// The living business plan — where automatic business development becomes
// visible. AI generates the plan from everything FleetCrown knows (profile,
// sibling projects, recent agent activity); each plan action is one click
// from the project's prompt queue, so the autopilot executes the business
// plan the same way it executes code work. Regenerating iterates the plan
// against what happened since. Collapsed by default — progressive disclosure.

import { useState } from "react";
import { Briefcase, ChevronDown, ChevronRight, Loader2, ListPlus, Check, RefreshCw, Sparkles } from "lucide-react";
import { MarkdownText } from "@/components/ui/markdown-text";
import { AttrRow } from "./project-overview-helpers";
import { postJson } from "@/lib/api/fetch";

// Labels for the market-lens keys (the key list itself is BUSINESS_ATTRS in
// project-detail-types.ts — config owns membership, this owns presentation).
const MARKET_LENS_ATTRS: { key: string; label: string }[] = [
  { key: "problem", label: "Problem" },
  { key: "solution", label: "Solution" },
  { key: "current_alternatives", label: "Current alternatives" },
  { key: "competitors", label: "Competitors" },
  { key: "complements_substitutes", label: "Complements & substitutes" },
  { key: "partnerships", label: "Partnerships & synergies" },
  { key: "potential_customers", label: "Potential customers" },
  { key: "expansion_ideas", label: "Expansion ideas" },
];

type BusinessAction = { title: string; prompt: string };

function parseActions(raw: string | undefined): BusinessAction[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((a): a is BusinessAction => typeof a?.title === "string" && typeof a?.prompt === "string")
      : [];
  } catch {
    return [];
  }
}

export function BusinessPlanSection({
  attrs,
  projectId,
  projectName,
  editable,
  onReload,
}: {
  attrs: Record<string, string>;
  projectId: string;
  /** Queue key — matches the control tab key for this project. */
  projectName: string;
  editable: boolean;
  onReload: () => void;
}) {
  const plan = attrs["business_plan"];
  const actions = parseActions(attrs["business_actions"]);
  const updatedAt = attrs["business_plan_updated_at"];
  const lensFilled = MARKET_LENS_ATTRS.filter(({ key }) => attrs[key]);

  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedTitles, setQueuedTitles] = useState<Set<string>>(new Set());
  const [queueError, setQueueError] = useState<string | null>(null);

  const hasAnything = Boolean(plan) || lensFilled.length > 0;
  if (!hasAnything && !editable) return null;

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await postJson(`/api/projects/${projectId}/business-plan`, {});
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setOpen(true);
      onReload();
    } catch {
      setError("Network error — try again");
    } finally {
      setGenerating(false);
    }
  }

  async function queueAction(action: BusinessAction) {
    setQueueError(null);
    try {
      const key = encodeURIComponent(projectName);
      const current = await fetch(`/api/beacon/queue/${key}`);
      const { queue = [], revision } = await current.json() as { queue?: string[]; revision?: number };
      const res = await fetch(`/api/beacon/queue/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue: [...queue, action.prompt], expectedRevision: revision }),
      });
      if (!res.ok) {
        setQueueError(res.status === 409 ? "Queue changed elsewhere — try again" : `Queue failed (HTTP ${res.status})`);
        return;
      }
      setQueuedTitles((prev) => new Set(prev).add(action.title));
    } catch {
      setQueueError("Network error — try again");
    }
  }

  return (
    <div className="ui-card-shell p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-left">
        {open ? <ChevronDown className="h-3.5 w-3.5 text-text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-text-muted" />}
        <Briefcase className="h-3.5 w-3.5 text-accent-text" />
        <span className="text-sm font-medium text-text-primary">Business plan</span>
        {plan && updatedAt && (
          <span className="text-micro text-text-muted">iterated {updatedAt.slice(0, 10)}</span>
        )}
        {actions.length > 0 && (
          <span className="ml-auto text-micro text-text-muted">{actions.length} actions</span>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {editable && (
            <button onClick={generate} disabled={generating} className="ui-btn-chip gap-1.5 px-3 py-1.5 text-xs">
              {generating
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : plan ? <RefreshCw className="h-3.5 w-3.5 text-accent-text" /> : <Sparkles className="h-3.5 w-3.5 text-accent-text" />}
              {generating ? "Thinking…" : plan ? "Iterate plan — fold in what happened" : "Generate business plan"}
            </button>
          )}
          {error && <p className="ui-error-xs">{error}</p>}

          {plan && <MarkdownText text={plan} />}

          {actions.length > 0 && (
            <div className="space-y-1.5">
              <p className="ui-kicker">Next business actions — queue them for the agent</p>
              {actions.map((action) => (
                <div key={action.title} className="flex items-start gap-2 rounded-lg border border-border-subtle bg-surface-raised/50 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text-primary">{action.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-tertiary" title={action.prompt}>{action.prompt}</p>
                  </div>
                  {editable && (
                    <button
                      onClick={() => queueAction(action)}
                      disabled={queuedTitles.has(action.title)}
                      className="ui-btn-chip shrink-0 gap-1 px-2 py-1 text-micro"
                      title="Add to this project's prompt queue — the autopilot executes it"
                    >
                      {queuedTitles.has(action.title)
                        ? <><Check className="h-3 w-3 text-status-positive" /> Queued</>
                        : <><ListPlus className="h-3 w-3" /> Queue</>}
                    </button>
                  )}
                </div>
              ))}
              {queueError && <p className="ui-error-xs">{queueError}</p>}
            </div>
          )}

          {lensFilled.length > 0 && (
            <div>
              <p className="ui-kicker mb-1">Market lens</p>
              {lensFilled.map(({ key, label }) => (
                <AttrRow
                  key={key}
                  label={label}
                  value={attrs[key]}
                  projectId={projectId}
                  attrKey={key}
                  onReload={onReload}
                  editable={editable}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
