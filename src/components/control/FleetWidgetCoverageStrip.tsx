"use client";

import { useState } from "react";
import Link from "next/link";
import { Code2, Loader2, Rocket } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { postJson } from "@/lib/api/fetch";
import type { WidgetCoverageItem } from "@/db/queries/widget-tokens";

type InstallOutcome = {
  ok: boolean;
  message: string;
};

/**
 * Fleet widget coverage: sites missing a live embed. Enable & install must
 * fail honestly (no git URL, site paused) — never "queued" into an empty Terminal.
 */
export function FleetWidgetCoverageStrip() {
  const { data, refetch, loading } = useFetch<{
    coverage: WidgetCoverageItem[];
    needsAttention: WidgetCoverageItem[];
  }>("/api/feedback/widget-coverage");
  const needs = data?.needsAttention ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, InstallOutcome>>({});

  if (loading || needs.length === 0) return null;

  async function enableAndInstall(projectId: string, projectName: string) {
    setBusyId(projectId);
    setOutcomes((prev) => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    try {
      const res = await postJson(`/api/projects/${projectId}/widget-token/install`, { mode: "install" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
        nextStep?: string;
        code?: string;
      };
      if (!res.ok) {
        setOutcomes((prev) => ({
          ...prev,
          [projectId]: {
            ok: false,
            message: [body.error, body.hint].filter(Boolean).join(" ") || "Install could not start.",
          },
        }));
        return;
      }
      setOutcomes((prev) => ({
        ...prev,
        [projectId]: {
          ok: true,
          message:
            body.nextStep
            || `Queued for ${projectName}. Stay on Control — if Attention shows Retry, the agent never started.`,
        },
      }));
      refetch();
    } catch (e) {
      setOutcomes((prev) => ({
        ...prev,
        [projectId]: {
          ok: false,
          message: e instanceof Error ? e.message : "Install could not start.",
        },
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ui-panel border-l-2 border-l-accent-primary">
      <div className="flex items-start gap-3 px-4 py-3">
        <Code2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-medium text-text-secondary">
            Widget not on live site ({needs.length})
          </p>
          <p className="text-micro text-text-tertiary">
            Criteria: has a public URL, and no recent widget boot heartbeat (or token missing/paused).
          </p>
          <ul className="divide-y divide-border-subtle">
            {needs.map((p) => {
              const outcome = outcomes[p.projectId];
              const reason = !p.hasToken
                ? "not enabled"
                : p.tokenStatus !== "active"
                  ? "token paused"
                  : "token on — never seen a boot from the live site";
              const controlHref = `/control?focus=${encodeURIComponent(p.projectName)}`;
              return (
                <li key={p.projectId} className="flex flex-col gap-2 py-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">{p.projectName}</p>
                      <p className="truncate text-xs text-text-tertiary">
                        {[reason, p.productionUrl || p.gitUrl || "no git URL"].filter(Boolean).join(" · ")}
                      </p>
                      {!p.gitUrl && !p.productionUrl && (
                        <p className="mt-0.5 text-xs text-status-negative">
                          No git URL — one-click install cannot land code. Add the repo URL or paste the snippet from the project Widget card.
                        </p>
                      )}
                      {!p.gitUrl && p.productionUrl && (
                        <p className="mt-0.5 text-xs text-status-negative">
                          No git URL on this project — Enable & install needs the repo (or a local dir on the runner). Paste the snippet from the Widget card as a fallback.
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => enableAndInstall(p.projectId, p.projectName)}
                        disabled={busyId === p.projectId || !p.gitUrl}
                        className="ui-btn-save gap-1.5"
                        title={
                          p.gitUrl
                            ? "Mint token if needed and queue an agent to embed the widget in the repo"
                            : "Blocked — project has no git URL"
                        }
                      >
                        {busyId === p.projectId ? <Loader2 className="ui-spinner-xs" /> : <Rocket className="h-3 w-3" />}
                        Enable & install
                      </button>
                      <Link
                        href={controlHref}
                        className="text-xs text-text-tertiary underline-offset-2 hover:underline"
                        title="Focus this project on Control (Terminal is empty until an agent session exists)"
                      >
                        Open on Control
                      </Link>
                      <Link
                        href={`/projects/${p.projectId}#feedback`}
                        className="text-xs text-text-tertiary underline-offset-2 hover:underline"
                      >
                        Widget card
                      </Link>
                    </div>
                  </div>
                  {outcome && (
                    <p className={outcome.ok ? "text-xs text-text-secondary" : "ui-error"}>
                      {outcome.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
