"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitSessionItems } from "@/lib/session-content";
import type { ProjectState } from "@/lib/control-types";
import copy from "@/config/session-handoff-copy.json";

export type SessionHandoffData = {
  next: string[];
  inProgress: string[];
  completed: string[];
  facts: string[];
};

export function buildSessionHandoffFromProjectSession(
  session: ProjectState["session"],
): SessionHandoffData | null {
  if (!session) return null;
  return compactHandoff({
    next: session.next ? splitSessionItems(session.next) : [],
    inProgress: [],
    completed: session.done ? splitSessionItems(session.done) : [],
    facts: buildFactRows({
      tests: session.tests,
      todos: session.todos,
      health: session.health,
    }),
  });
}

function buildFactRows(values: { tests?: string; todos?: string; health?: string }): string[] {
  return [
    values.tests && `${copy.factLabels.tests}: ${values.tests}`,
    values.todos && `${copy.factLabels.todos}: ${values.todos}`,
    values.health && `${copy.factLabels.health}: ${values.health}`,
  ].filter(Boolean) as string[];
}

function compactHandoff(data: SessionHandoffData): SessionHandoffData | null {
  const cleaned = {
    next: data.next.map((item) => item.trim()).filter(Boolean),
    inProgress: data.inProgress.map((item) => item.trim()).filter(Boolean),
    completed: data.completed.map((item) => item.trim()).filter(Boolean),
    facts: data.facts.map((item) => item.trim()).filter(Boolean),
  };

  if (
    cleaned.next.length === 0 &&
    cleaned.inProgress.length === 0 &&
    cleaned.completed.length === 0 &&
    cleaned.facts.length === 0
  ) {
    return null;
  }

  return cleaned;
}

function BulletList({
  items,
  kind,
}: {
  items: string[];
  kind: "next" | "inProgress" | "completed";
}) {
  const iconClass =
    kind === "completed"
      ? "text-status-positive"
      : kind === "inProgress"
        ? "text-status-warning"
        : "text-accent-text";
  const textClass = kind === "next" ? "text-text-primary" : "text-text-secondary";

  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={`${kind}-${i}`} className="flex gap-3">
          {kind === "completed" ? (
            <Check className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
          ) : kind === "inProgress" ? (
            <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full bg-current", iconClass)} />
          ) : (
            <ArrowRight className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
          )}
          <p className={cn("select-text text-base leading-relaxed", textClass)}>{item}</p>
        </div>
      ))}
    </div>
  );
}

export function SessionHandoff({
  data,
  surface = "section",
  microLabels = false,
}: {
  data: SessionHandoffData | null;
  surface?: "section" | "panel" | "plain";
  microLabels?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;

  const needsExpand =
    data.next.length > 1 ||
    data.inProgress.length > 0 ||
    data.completed.length > 0 ||
    data.facts.length > 0;
  const preview = data.next[0] ?? data.completed[0] ?? data.inProgress[0] ?? data.facts[0] ?? "";
  const shellClass =
    surface === "panel"
      ? "ui-panel rounded-2xl p-5 space-y-4"
      : surface === "plain"
        ? "space-y-4"
        : "ui-card-section space-y-5";
  const labelClass = cn("ui-kicker text-accent-text", microLabels && "text-micro");

  if (!expanded) {
    return (
      <div className={shellClass}>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className={labelClass}>{copy.title}</p>
            {needsExpand && (
              <button
                onClick={() => setExpanded(true)}
                className="shrink-0 whitespace-nowrap text-sm text-text-muted transition-colors hover:text-text-secondary"
              >
                {copy.details}
              </button>
            )}
          </div>
          <div className="flex min-w-0 gap-3">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
            <p className="select-text text-base leading-relaxed text-text-primary">{preview}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="flex items-center justify-between">
        <span className={labelClass}>{copy.title}</span>
        <button
          onClick={() => setExpanded(false)}
          className="text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          {copy.collapse}
        </button>
      </div>
      {data.next.length > 0 && (
        <div className="space-y-2.5">
          <p className={cn("ui-kicker", microLabels && "text-micro")}>{copy.next}</p>
          <BulletList items={data.next} kind="next" />
        </div>
      )}
      {data.inProgress.length > 0 && (
        <div className="space-y-2.5">
          <p className={cn("ui-kicker text-status-warning", microLabels && "text-micro")}>
            {copy.inProgress}
          </p>
          <BulletList items={data.inProgress} kind="inProgress" />
        </div>
      )}
      {data.completed.length > 0 && (
        <div className="space-y-2.5">
          <p className={cn("ui-kicker text-text-muted", microLabels && "text-micro")}>
            {copy.completed} · {data.completed.length}
          </p>
          <BulletList items={data.completed} kind="completed" />
        </div>
      )}
      {data.facts.length > 0 && (
        <div className="space-y-2">
          <p className={cn("ui-kicker text-text-muted", microLabels && "text-micro")}>
            {copy.facts}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {data.facts.map((fact) => (
              <div
                key={fact}
                className="rounded-lg border border-border-subtle bg-surface-overlay px-3 py-2 text-xs leading-relaxed text-text-tertiary"
              >
                {fact}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
