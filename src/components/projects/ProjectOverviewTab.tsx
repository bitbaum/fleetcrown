"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Circle,
  Code2,
  FileCheck,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  Rocket,
  Sparkles,
  Terminal,
  Users,
  Wrench,
} from "lucide-react";
import type { ProjectData } from "./project-detail-types";
import {
  ISSUE_ATTRS,
  RESERVED,
  SUGGESTED_ATTRS,
  SUGGESTED_ATTR_LABELS,
  SUGGESTED_ATTR_PLACEHOLDERS,
  BUILD_ATTRS,
  BUILD_ATTR_LABELS,
  BUILD_ATTR_PLACEHOLDERS,
  CHANNEL_CONFIG,
  getProjectLinks,
} from "./project-detail-types";
import { ProjectBriefFill } from "./ProjectBriefFill";
import { ProjectDocSync } from "./ProjectDocSync";
import { ProjectProvision } from "./ProjectProvision";
import { BusinessPlanSection } from "./BusinessPlanSection";
import { HEALTH_SIGNAL_CONFIG } from "./project-badges";
import { AddAttrInline, AttrRow, ClaudeSession, DevLogSection } from "./project-overview-helpers";
import { postJson } from "@/lib/api/fetch";
import { toLocalDateStr, timeAgo } from "@/lib/dates";
import { ENTITY_TYPE, INTERACTION_DIRECTION } from "@/lib/constants/statuses";
import { cn } from "@/lib/utils";
import { STATUS_DOT_CLASS, formatActivityTime } from "@/components/activity/activity-shared";
import { isNoisyProfileActivity, sanitizeActivityPreview } from "@/lib/activity-display";
import type { EventStatus } from "@/lib/activity-status";
import { NAV } from "@/config/navigation";

const CHANNEL_ICON: Record<string, React.ElementType> = {
  "work-session": Code2,
  meeting: Users,
  ivy: Bot,
  review: FileCheck,
  deployment: Rocket,
  call: Phone,
  other: Circle,
};

const PROFILE_KEYS = new Set(SUGGESTED_ATTRS.map((s) => s.key));
const ACTIVITY_IN_DRAWER = 8;

function NextStepSection({
  attrs, projectId, editable, onReload,
}: {
  attrs: Record<string, string>;
  projectId: string;
  editable: boolean;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const value = attrs["next_step"];

  if (!value && !editable) return null;

  if (editing) {
    return (
      <div className="rounded-xl border border-status-positive/20 bg-status-positive-subtle p-3 space-y-2">
        <div className="ui-micro-label text-status-positive/70">Next step</div>
        <AddAttrInline
          projectId={projectId}
          presetKey="next_step"
          presetPlaceholder="Single most important next action"
          initialValue={value}
          onSaved={() => { setEditing(false); onReload(); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  if (!value) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2.5 text-left transition-colors hover:border-status-positive/30 hover:bg-status-positive-subtle"
      >
        <Plus className="h-3.5 w-3.5 shrink-0 text-status-positive/60" aria-hidden="true" />
        <span className="text-sm text-text-muted">Define the one action that moves this forward</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-status-positive/20 bg-status-positive-subtle p-3",
        editable && "cursor-text",
      )}
      onClick={editable ? () => setEditing(true) : undefined}
      onKeyDown={editable ? (e) => { if (e.key === "Enter") setEditing(true); } : undefined}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      title={editable ? "Click to edit next step" : undefined}
    >
      <div className="mb-1.5 flex items-center gap-1.5 ui-micro-label text-status-positive/70">
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Next step
      </div>
      <p className="text-sm leading-relaxed text-text-primary">{value}</p>
    </div>
  );
}

function IssuesBlock({ attrs }: { attrs: Record<string, string> }) {
  const issues = HEALTH_SIGNAL_CONFIG.filter((cfg) => attrs[cfg.key]);
  if (issues.length === 0) return null;

  return (
    <section className="ui-project-action-stack" aria-label="Issues">
      {issues.map(({ key, icon: Icon, cardLabel, cardBorder, cardBg, cardText, cardBody }) => (
        <div key={key} className={cn("ui-card-shell p-3", cardBorder, cardBg)}>
          <div className={cn("mb-1.5 flex items-center gap-1.5 ui-micro-label font-semibold", cardText)}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {cardLabel}
          </div>
          <p className={cn("text-sm leading-relaxed", cardBody)}>{attrs[key]}</p>
        </div>
      ))}
    </section>
  );
}

export function OverviewTab({
  data,
  projectId,
  onReload,
}: {
  data: ProjectData;
  projectId: string;
  onReload: () => void;
}) {
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [activityList, setActivityList] = useState(data.interactions);
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [actChannel, setActChannel] = useState<string>(CHANNEL_CONFIG[0].key);
  const [actSummary, setActSummary] = useState("");
  const [actDate, setActDate] = useState(toLocalDateStr(new Date()));
  const [actSaving, setActSaving] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

  const editable = !data.readonly;
  const attrs = data.attrs;
  const hasIssues = ISSUE_ATTRS.some((k) => attrs[k]);

  const profileAttrs = SUGGESTED_ATTRS.filter(({ key }) => attrs[key]?.trim());
  const buildAttrs = BUILD_ATTRS.filter((key) => attrs[key]?.trim());
  const missingBuild = BUILD_ATTRS.filter((key) => !attrs[key]?.trim());
  const missingSuggested = SUGGESTED_ATTRS.filter(({ key }) => !attrs[key]?.trim());
  const otherAttrs = Object.entries(attrs).filter(
    ([k]) => !RESERVED.includes(k) && !PROFILE_KEYS.has(k),
  );

  const handleLogActivity = async () => {
    setActSaving(true);
    setActError(null);
    try {
      const res = await postJson(`/api/projects/${projectId}/interactions`, {
        channel: actChannel,
        direction: INTERACTION_DIRECTION.OUTBOUND,
        summary: actSummary || undefined,
        occurredAt: actDate,
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) {
        setActivityList((prev) => [
          { channel: actChannel, direction: INTERACTION_DIRECTION.OUTBOUND, summary: actSummary || null, occurredAt: actDate },
          ...prev,
        ]);
        setLoggingActivity(false);
        setActSummary("");
        setActDate(toLocalDateStr(new Date()));
      } else {
        setActError(json.error ?? "Failed to log");
      }
    } catch {
      setActError("Network error — try again");
    } finally {
      setActSaving(false);
    }
  };

  type FeedEntry = {
    id: string;
    at: string;
    tone: EventStatus;
    icon: React.ElementType;
    primary: string;
    secondary?: string | null;
    meta?: string;
  };

  const activityFeed: FeedEntry[] = [
    ...data.activity
      .filter((ev) => !isNoisyProfileActivity(ev.title, ev.detail))
      .map((ev) => ({
        id: ev.id,
        at: ev.at,
        tone: ev.status,
        icon: Bot,
        primary: ev.title,
        secondary: ev.detail,
        meta: [ev.source, ev.adapter, ev.intent].filter(Boolean).join(" · "),
      })),
    ...activityList.map((i, idx) => ({
      id: `interaction:${idx}:${i.occurredAt}`,
      at: i.occurredAt,
      tone: "neutral" as EventStatus,
      icon: CHANNEL_ICON[i.channel] ?? Circle,
      primary: i.channel.replace(/-/g, " "),
      secondary: i.summary,
      meta: "logged",
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, ACTIVITY_IN_DRAWER);

  const activityTotal = data.activity.length + activityList.length;
  const hasBusiness = Boolean(attrs["business_plan"]) || Boolean(attrs["problem"]);
  const hasDeveloper = data.devLog.length > 0 || Boolean(data.runtimeState);

  return (
    <div className="space-y-5">
      {/* 1. Action — what is wrong and what to do next */}
      {(hasIssues || attrs["next_step"] || editable) && (
        <section className="ui-project-action-stack">
          <IssuesBlock attrs={attrs} />
          <NextStepSection attrs={attrs} projectId={projectId} editable={editable} onReload={onReload} />
          {hasIssues && editable && (
            <Link href={NAV.control.href} className="ui-btn-chip inline-flex min-h-11 w-full items-center justify-center gap-2 text-sm">
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              Open Control to dispatch a fix
            </Link>
          )}
        </section>
      )}

      {/* 2. Context — only filled profile fields (no empty placeholders) */}
      {(profileAttrs.length > 0 || buildAttrs.length > 0 || otherAttrs.length > 0) && (
        <section aria-label="Profile context">
          <h3 className="ui-projects-section-label mb-2">Context</h3>
          <div className="ui-project-profile-block">
            {profileAttrs.map(({ key, label }) => (
              <AttrRow
                key={key}
                label={label}
                value={attrs[key]!}
                projectId={projectId}
                attrKey={key}
                onReload={onReload}
                placeholder={SUGGESTED_ATTR_PLACEHOLDERS[key]}
                editable={editable}
              />
            ))}
            {buildAttrs.map((key) => (
              <AttrRow
                key={key}
                label={BUILD_ATTR_LABELS[key]}
                value={attrs[key]!}
                projectId={projectId}
                attrKey={key}
                onReload={onReload}
                placeholder={BUILD_ATTR_PLACEHOLDERS[key]}
                editable={editable}
              />
            ))}
            {otherAttrs.map(([key, value]) => (
              <AttrRow
                key={key}
                label={SUGGESTED_ATTR_LABELS[key] ?? key.replace(/_/g, " ")}
                value={value}
                projectId={projectId}
                attrKey={key}
                onReload={onReload}
                editable={editable}
              />
            ))}
          </div>
        </section>
      )}

      {/* 3. Progressive disclosure — tools, not triage */}
      {!data.readonly && (
        <details className="ui-project-drawer-panel">
          <summary className="ui-project-drawer-panel-summary">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden="true" />
            Fill or update profile
          </summary>
          <div className="ui-project-drawer-panel-body">
            {!data.gitUrl && <ProjectProvision projectId={projectId} onReload={onReload} />}
            <ProjectBriefFill
              projectId={projectId}
              hasRepo={getProjectLinks(attrs, data.gitUrl).repo !== null}
              onReload={onReload}
            />
            <ProjectDocSync projectId={projectId} onReload={onReload} />
          </div>
        </details>
      )}

      {editable && (missingSuggested.length > 0 || missingBuild.length > 0) && (
        <details className="ui-project-drawer-panel">
          <summary className="ui-project-drawer-panel-summary">
            <Plus className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
            Add context
            <span className="ui-projects-filter-count">{missingSuggested.length + missingBuild.length}</span>
          </summary>
          <div className="ui-project-drawer-panel-body space-y-2">
            {missingSuggested.map(({ key, label, placeholder }) => (
              <div key={key}>
                {addingKey === key ? (
                  <>
                    <div className="ui-micro-label mb-1">{label}</div>
                    <AddAttrInline
                      projectId={projectId}
                      presetKey={key}
                      presetPlaceholder={placeholder}
                      onSaved={() => { setAddingKey(null); onReload(); }}
                      onCancel={() => setAddingKey(null)}
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingKey(key)}
                    className="flex min-h-11 w-full items-center gap-2 text-left text-sm text-text-secondary hover:text-text-primary"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                    <span>{label}</span>
                    <span className="truncate text-text-muted">— {placeholder}</span>
                  </button>
                )}
              </div>
            ))}
            {missingBuild.map((key) => (
              <div key={key}>
                {addingKey === key ? (
                  <>
                    <div className="ui-micro-label mb-1">{BUILD_ATTR_LABELS[key]}</div>
                    <AddAttrInline
                      projectId={projectId}
                      presetKey={key}
                      presetPlaceholder={BUILD_ATTR_PLACEHOLDERS[key]}
                      onSaved={() => { setAddingKey(null); onReload(); }}
                      onCancel={() => setAddingKey(null)}
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingKey(key)}
                    className="flex min-h-11 w-full items-center gap-2 text-left text-sm text-text-secondary hover:text-text-primary"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                    <span>{BUILD_ATTR_LABELS[key]}</span>
                    <span className="truncate text-text-muted">— {BUILD_ATTR_PLACEHOLDERS[key]}</span>
                  </button>
                )}
              </div>
            ))}
            {addingKey === "__custom__" ? (
              <AddAttrInline
                projectId={projectId}
                onSaved={() => { setAddingKey(null); onReload(); }}
                onCancel={() => setAddingKey(null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingKey("__custom__")}
                className="text-xs text-text-tertiary hover:text-status-positive"
              >
                + Custom attribute
              </button>
            )}
          </div>
        </details>
      )}

      {(hasBusiness || editable) && (
        hasBusiness ? (
          <BusinessPlanSection
            attrs={attrs}
            projectId={projectId}
            projectName={data.name}
            editable={editable}
            onReload={onReload}
          />
        ) : (
          <details className="ui-project-drawer-panel">
            <summary className="ui-project-drawer-panel-summary">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden="true" />
              Business plan
            </summary>
            <div className="ui-project-drawer-panel-body">
              <BusinessPlanSection
                attrs={attrs}
                projectId={projectId}
                projectName={data.name}
                editable={editable}
                onReload={onReload}
              />
            </div>
          </details>
        )
      )}

      {data.relations.some((r) => r.targetType === ENTITY_TYPE.PERSON) && (
        <div>
          <h3 className="ui-projects-section-label mb-2">People</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.relations
              .filter((r) => r.targetType === ENTITY_TYPE.PERSON)
              .map((r) => (
                <span key={r.targetId} className="ui-tag ui-tag-neutral">
                  {r.targetName}
                </span>
              ))}
          </div>
        </div>
      )}

      <details className="ui-projects-activity-panel">
        <summary className="ui-projects-activity-summary">
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span>Recent activity</span>
          <span className="ui-projects-filter-count">{activityFeed.length}</span>
        </summary>
        <div className="ui-projects-activity-body space-y-2.5">
          {activityFeed.map((e) => {
            const Icon = e.icon;
            const preview = e.secondary ? sanitizeActivityPreview(e.secondary) : null;
            return (
              <div key={e.id} className="flex items-start gap-2 text-xs">
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT_CLASS[e.tone])} aria-hidden />
                <Icon className="mt-0.5 h-3 w-3 shrink-0 text-text-tertiary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate capitalize text-text-secondary">{e.primary}</span>
                    <span className="ml-auto shrink-0 text-text-muted tabular-nums" title={formatActivityTime(e.at)}>
                      {timeAgo(Date.parse(e.at))}
                    </span>
                  </div>
                  {e.meta && e.meta !== "logged" && <div className="text-text-muted">{e.meta}</div>}
                  {preview && (
                    <p className="line-clamp-2 leading-relaxed text-text-tertiary">{preview}</p>
                  )}
                </div>
              </div>
            );
          })}
          {activityFeed.length === 0 && !loggingActivity && (
            <p className="text-xs text-text-secondary">No notable activity — agent noise is on the Activity page.</p>
          )}
          {activityTotal > ACTIVITY_IN_DRAWER && (
            <Link
              href={`${NAV.activity.href}?project=${encodeURIComponent(data.name)}`}
              className="inline-block text-xs text-accent-text hover:underline"
            >
              View full timeline ({activityTotal} events)
            </Link>
          )}
        </div>

        {loggingActivity ? (
          <div className="ui-projects-activity-body mt-0 space-y-2 border-t border-border-subtle pt-3">
            <div className="flex gap-2">
              <select
                value={actChannel}
                onChange={(e) => setActChannel(e.target.value)}
                className="flex-1 ui-input-tight"
              >
                {CHANNEL_CONFIG.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <input
                type="date"
                value={actDate}
                onChange={(e) => setActDate(e.target.value)}
                className="ui-input-tight"
              />
            </div>
            <input
              value={actSummary}
              onChange={(e) => setActSummary(e.target.value)}
              placeholder="What happened? (optional)"
              onKeyDown={(e) => { if (e.key === "Enter") handleLogActivity(); if (e.key === "Escape") setLoggingActivity(false); }}
              autoFocus
              className="w-full ui-input-tight"
            />
            {actError && <p className="ui-error-xs">{actError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={handleLogActivity} disabled={actSaving} className="ui-btn-save">
                {actSaving ? <Loader2 className="ui-spinner-xs" /> : "Save"}
              </button>
              <button type="button" onClick={() => { setLoggingActivity(false); setActError(null); }} className="ui-btn-text-cancel">
                Cancel
              </button>
            </div>
          </div>
        ) : editable && (
          <button
            type="button"
            onClick={() => setLoggingActivity(true)}
            className="ui-btn-add-success mx-4 mb-4 mt-2"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Log activity
          </button>
        )}
      </details>

      {hasDeveloper && (
        <details className="ui-project-drawer-panel">
          <summary className="ui-project-drawer-panel-summary">
            <Wrench className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
            Developer
          </summary>
          <div className="ui-project-drawer-panel-body space-y-4">
            {data.devLog.length > 0 && <DevLogSection entries={data.devLog} />}
            <ClaudeSession tabName={data.runtimeState?.tabName ?? data.name} />
          </div>
        </details>
      )}
    </div>
  );
}
