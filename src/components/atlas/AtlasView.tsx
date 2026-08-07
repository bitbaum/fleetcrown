"use client";

import { useMemo, useState } from "react";
import { RefreshCw, ArrowRight, ArrowLeftRight, Unlink } from "lucide-react";
import { AtlasCard, siteState, previewState, type SiteState } from "./AtlasCard";
import { buildAtlasGraph } from "@/lib/atlas/graph";
import { suggestFleetLinks } from "@/lib/atlas/suggest";
import { LinkSuggestions } from "./LinkSuggestions";
import type { AtlasRow } from "@/db/queries/atlas";

const SUMMARY: { state: SiteState; label: string; className: string }[] = [
  { state: "up", label: "live", className: "text-status-positive" },
  { state: "down", label: "down", className: "text-status-negative" },
  { state: "unchecked", label: "unchecked", className: "text-status-warning" },
  { state: "no-site", label: "no site yet", className: "text-text-tertiary" },
];

export function AtlasView({ initialRows }: { initialRows: AtlasRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const counts = useMemo(() => {
    const tally = new Map<SiteState, number>();
    for (const row of rows) tally.set(siteState(row), (tally.get(siteState(row)) ?? 0) + 1);
    return tally;
  }, [rows]);

  // Counted only over sites we actually checked: a site nobody probed has no
  // preview evidence either way, and guessing would inflate the number.
  const previewGap = useMemo(
    () => rows.filter((r) => r.snapshot && previewState(r) !== "ok").length,
    [rows],
  );

  const graph = useMemo(
    () =>
      buildAtlasGraph(
        rows.map((r) => ({
          projectId: r.projectId,
          name: r.name,
          liveUrl: r.liveUrl,
          outboundHosts: r.snapshot?.outboundHosts ?? [],
        })),
      ),
    [rows],
  );

  const suggestions = useMemo(
    () =>
      suggestFleetLinks(
        rows.map((r) => ({
          projectId: r.projectId,
          name: r.name,
          liveUrl: r.liveUrl,
          outboundHosts: r.snapshot?.outboundHosts ?? [],
        })),
      ),
    [rows],
  );

  // Only sites we have actually observed can be judged "linked to by nobody" —
  // an unchecked site has no outbound data, so calling it isolated would be a
  // claim about our own laziness, not about the fleet.
  const observed = useMemo(
    () => new Set(rows.filter((r) => r.snapshot).map((r) => r.projectId)),
    [rows],
  );
  const unlinked = graph.unlinked.filter((s) => observed.has(s.projectId));
  const oneWay = graph.edges.filter((e) => !e.reciprocal);

  async function refreshAll() {
    setRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/atlas/refresh", { method: "POST" });
      const json = (await res.json()) as { probed?: number; up?: number; down?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Refresh failed");
      setMessage(`Checked ${json.probed} sites — ${json.up} up, ${json.down} down.`);
      const fresh = await fetch("/api/atlas", { cache: "no-store" });
      if (fresh.ok) setRows(((await fresh.json()) as { rows: AtlasRow[] }).rows);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  function handleSaved(projectId: string, liveUrl: string | null) {
    // The PATCH probes immediately, so pull the row back rather than guessing
    // the new snapshot locally — a guessed "up" that isn't would be a lie.
    setRows((prev) => prev.map((r) => (r.projectId === projectId ? { ...r, liveUrl } : r)));
    void (async () => {
      const fresh = await fetch("/api/atlas", { cache: "no-store" });
      if (fresh.ok) setRows(((await fresh.json()) as { rows: AtlasRow[] }).rows);
    })();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {SUMMARY.map(({ state, label, className }) => (
            <span key={state} className={className}>
              <span className="font-semibold">{counts.get(state) ?? 0}</span>{" "}
              <span className="text-text-tertiary">{label}</span>
            </span>
          ))}
          {previewGap > 0 && (
            <span className="text-status-warning">
              <span className="font-semibold">{previewGap}</span>{" "}
              <span className="text-text-tertiary">share as a blank preview</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-border-default bg-surface-raised px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-overlay disabled:opacity-60"
        >
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
          {refreshing ? "Checking sites…" : "Check all sites"}
        </button>
      </div>

      {message && <p className="text-sm text-text-secondary">{message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <AtlasCard key={row.projectId} row={row} onSaved={handleSaved} />
        ))}
      </div>

      <LinkSuggestions suggestions={suggestions} />

      <section aria-labelledby="atlas-graph-title" className="rounded-2xl border border-border-subtle bg-surface-raised p-5">
        <h2 id="atlas-graph-title" className="text-base font-semibold text-text-primary">
          How your sites connect
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Every link below was found on a live page — not declared anywhere. A site with no
          inbound link is one your visitors cannot reach from the rest of your work.
        </p>

        {graph.edges.length === 0 && unlinked.length === 0 ? (
          <p className="mt-4 text-sm text-text-tertiary">
            Nothing observed yet — run a check to build the graph.
          </p>
        ) : (
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-text-primary">Links between your sites</h3>
              {graph.edges.length === 0 ? (
                <p className="mt-2 text-sm text-text-tertiary">None. Your sites do not link to each other at all.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {graph.edges.map((edge) => (
                    <li
                      key={`${edge.fromProjectId}-${edge.toProjectId}`}
                      className="flex items-center gap-2 text-sm text-text-secondary"
                    >
                      {edge.reciprocal ? (
                        <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-status-positive" aria-hidden />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
                      )}
                      <span className="truncate">
                        {edge.fromName} <span className="text-text-tertiary">→</span> {edge.toName}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {oneWay.length > 0 && (
                <p className="mt-2 text-xs text-text-tertiary">
                  {oneWay.length} one-way — the target does not link back.
                </p>
              )}
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Unlink className="h-3.5 w-3.5 text-status-warning" aria-hidden />
                Nothing links here
              </h3>
              {unlinked.length === 0 ? (
                <p className="mt-2 text-sm text-text-tertiary">Every checked site has at least one inbound link.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {unlinked.map((site) => (
                    <li
                      key={site.projectId}
                      className="rounded-full bg-status-warning/10 px-2.5 py-0.5 text-xs text-status-warning"
                    >
                      {site.name}
                    </li>
                  ))}
                </ul>
              )}
              {graph.deadEnds.length > 0 && (
                <p className="mt-3 text-xs text-text-tertiary">
                  Links out to nothing in the fleet: {graph.deadEnds.map((s) => s.name).join(", ")}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
