"use client";

// /decisions — unified timeline of "what your fleet did and decided".
// Tier 1 of the auto-injection thesis: lets the user answer
// "what happened on my fleet last week?" without reading 5 session.md files.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, Bot, KeyRound, ScrollText, RefreshCw } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { getJson } from "@/lib/api/fetch";
import { timeAgo } from "@/lib/dates";
import type { DecisionEvent, DecisionFeedResponse } from "@/app/api/decisions/feed/route";
import { NAV } from "@/config/navigation";

const KIND_META: Record<DecisionEvent["kind"], { icon: typeof Sparkles; label: string; tone: string }> = {
  project_created: { icon: Sparkles, label: "Created", tone: "text-accent" },
  agent_run:       { icon: Bot,      label: "Agent run", tone: "text-status-positive" },
  token_minted:    { icon: KeyRound, label: "Token",    tone: "text-text-secondary" },
};

export default function DecisionsPage() {
  const [data, setData] = useState<DecisionFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("");

  useEffect(() => {
    // Mount-only fetch. Initial useState already declared loading=true, so
    // we don't setLoading(true) here (lint flags it as a cascading render).
    let cancelled = false;
    getJson<DecisionFeedResponse>("/api/decisions/feed?limit=100")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Memoize to keep the useMemos below stable across renders without
  // changing identity each pass (lint flags ?? [] as a fresh-array hazard).
  const events = useMemo(() => data?.events ?? [], [data]);

  // Build unique project list for the filter dropdown.
  const projectsInFeed = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.project) set.add(e.project);
    return Array.from(set).sort();
  }, [events]);

  const visible = useMemo(() => {
    if (!projectFilter) return events;
    return events.filter((e) => e.project === projectFilter);
  }, [events, projectFilter]);

  // Group by calendar day for readability.
  const grouped = useMemo(() => {
    const map = new Map<string, DecisionEvent[]>();
    for (const e of visible) {
      const day = e.timestamp.slice(0, 10); // YYYY-MM-DD
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    }
    return Array.from(map.entries()); // already sorted because input is sorted
  }, [visible]);

  return (
    <PageLayout
      title="Decisions"
      subtitle="What your fleet did and decided, newest first"
      right={<Link href={NAV.digests.href} className="ui-btn-secondary">Read digests</Link>}
    >
      <div className="space-y-4 max-w-3xl">
        {/* Filter bar */}
        {projectsInFeed.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-tertiary">Filter:</span>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="ui-input-tight"
            >
              <option value="">All projects ({events.length})</option>
              {projectsInFeed.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {data && (
              <span className="ml-auto text-xs text-text-tertiary flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                {timeAgo(new Date(data.generatedAt).getTime())}
              </span>
            )}
          </div>
        )}

        {/* Error */}
        {error && <div className="ui-error p-3 rounded-md text-sm">{error}</div>}

        {/* Loading */}
        {loading && !data && (
          <div className="ui-card-shell p-8 text-center">
            <p className="ui-page-subtitle">Loading…</p>
          </div>
        )}

        {/* Empty */}
        {!loading && events.length === 0 && (
          <div className="ui-card-shell p-8 text-center space-y-3">
            <ScrollText className="h-10 w-10 text-text-muted mx-auto" />
            <h3 className="ui-page-subtitle">No decisions yet</h3>
            <p className="text-sm text-text-muted max-w-md mx-auto">
              When you create a project, dispatch an agent, or mint a token, the event will land here.
              This page is the captain&apos;s view of your fleet&apos;s history.
            </p>
          </div>
        )}

        {/* Grouped timeline */}
        {grouped.length > 0 && (
          <div className="space-y-6">
            {grouped.map(([day, items]) => (
              <section key={day}>
                <h2 className="ui-kicker mb-2">{formatDayHeader(day)}</h2>
                <ul className="space-y-1.5">
                  {items.map((e) => {
                    const meta = KIND_META[e.kind];
                    const Icon = meta.icon;
                    return (
                      <li
                        key={e.id}
                        className="ui-card-shell flex items-start gap-3 p-3"
                      >
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.tone}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-text-primary">{e.summary}</span>
                            <span className="text-xs text-text-tertiary ml-auto shrink-0">
                              {formatTimeOfDay(e.timestamp)}
                            </span>
                          </div>
                          {e.detail && (
                            <p className="text-xs text-text-muted mt-0.5 truncate" title={e.detail}>
                              {e.detail}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {data?.truncatedAt && (
          <p className="text-xs text-text-tertiary text-center">
            Showing the most recent {data.truncatedAt} events.
          </p>
        )}
      </div>
    </PageLayout>
  );
}

function formatDayHeader(yyyyMmDd: string): string {
  const date = new Date(`${yyyyMmDd}T00:00:00`);
  const today = new Date();
  const yest = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const toYmd = (d: Date) => d.toISOString().slice(0, 10);
  if (toYmd(today) === yyyyMmDd) return "Today";
  if (toYmd(yest)  === yyyyMmDd) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
