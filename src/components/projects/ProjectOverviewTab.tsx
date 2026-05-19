"use client";

import { useState } from "react";
import { ArrowRight, Bot, Circle, Code2, FileCheck, Loader2, MessageSquare, Phone, Plus, Rocket, Users } from "lucide-react";
import type { ProjectData } from "./project-detail-types";
import {
  ISSUE_ATTRS, RESERVED, SUGGESTED_ATTRS, CHANNEL_CONFIG,
  SUGGESTED_ATTR_LABELS, SUGGESTED_ATTR_PLACEHOLDERS,
} from "./project-detail-types";
import { HEALTH_SIGNAL_CONFIG } from "./project-badges";
import { AddAttrInline, AttrRow, ClaudeSession, ProjectHistorySection, DevLogSection } from "./project-overview-helpers";
import { postJson } from "@/lib/api/fetch";
import { toLocalDateStr } from "@/lib/dates";
import { ENTITY_TYPE, INTERACTION_DIRECTION } from "@/lib/constants/statuses";
import { APP_LOCALE } from "@/lib/constants";

const CHANNEL_ICON: Record<string, React.ElementType> = {
  "work-session": Code2,
  meeting: Users,
  ivy: Bot,
  review: FileCheck,
  deployment: Rocket,
  call: Phone,
  other: Circle,
};

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
      <div className="rounded-lg border border-status-positive/20 bg-status-positive-subtle p-3 space-y-2">
        <div className="ui-micro-label text-status-positive/70">Next Step</div>
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
        onClick={() => setEditing(true)}
        className="flex min-h-9 w-full items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-left transition-colors hover:border-status-positive/30 hover:bg-status-positive-subtle"
      >
        <Plus className="h-3 w-3 shrink-0 text-status-positive/60" />
        <span className="text-xs text-text-muted italic">Define next step — the single most important action</span>
      </button>
    );
  }

  return (
    <div
      className={`rounded-lg border border-status-positive/20 bg-status-positive-subtle p-3 ${editable ? "cursor-text" : ""}`}
      onClick={editable ? () => setEditing(true) : undefined}
      title={editable ? "Click to edit next step" : undefined}
    >
      <div className="flex items-center gap-1.5 ui-micro-label text-status-positive/70 mb-1.5">
        <ArrowRight className="h-3 w-3" /> Next Step
      </div>
      <p className="text-xs text-text-primary leading-relaxed">{value}</p>
    </div>
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
  const [showEmpty, setShowEmpty] = useState(false);
  const [activityList, setActivityList] = useState(data.interactions);
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [actChannel, setActChannel] = useState<string>(CHANNEL_CONFIG[0].key);
  const [actSummary, setActSummary] = useState("");
  const [actDate, setActDate] = useState(toLocalDateStr(new Date()));
  const [actSaving, setActSaving] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

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
        setActivityList((prev) => [{ channel: actChannel, direction: INTERACTION_DIRECTION.OUTBOUND, summary: actSummary || null, occurredAt: actDate }, ...prev]);
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

  const attrs = data.attrs;
  const displayAttrs = Object.entries(attrs).filter(([k]) => !RESERVED.includes(k));
  const missingSuggested = SUGGESTED_ATTRS.filter(({ key }) => !attrs[key]);

  return (
    <div className="space-y-5">
      {ISSUE_ATTRS.some((k) => attrs[k]) && (
        <div className="space-y-2">
          {HEALTH_SIGNAL_CONFIG.filter((cfg) => attrs[cfg.key]).map(({ key, icon: Icon, cardLabel, cardBorder, cardBg, cardText, cardBody }) => (
            <div key={key} className={`ui-card-shell ${cardBorder} ${cardBg} p-3`}>
              <div className={`flex items-center gap-1.5 ui-micro-label font-semibold ${cardText} mb-1.5`}>
                <Icon className="h-3.5 w-3.5" /> {cardLabel}
              </div>
              <p className={`text-xs ${cardBody} leading-relaxed`}>{attrs[key]}</p>
            </div>
          ))}
        </div>
      )}

      <NextStepSection
        attrs={attrs}
        projectId={projectId}
        editable={!data.readonly}
        onReload={onReload}
      />

      {displayAttrs.length > 0 && (
        <div>
          {displayAttrs.map(([key, value]) => (
            <AttrRow
              key={key}
              label={SUGGESTED_ATTR_LABELS[key] ?? key.replace(/_/g, " ")}
              value={value}
              projectId={projectId}
              attrKey={key}
              onReload={onReload}
              placeholder={SUGGESTED_ATTR_PLACEHOLDERS[key]}
              editable={!data.readonly}
            />
          ))}
        </div>
      )}

      {!data.readonly && missingSuggested.length > 0 && (
        <div>
          {showEmpty ? (
            <div className="space-y-1">
              <div className="ui-micro-label mb-2">Add missing context</div>
              {missingSuggested.map(({ key, label, placeholder }) => (
                <div key={key}>
                  {addingKey === key ? (
                    <div className="py-1">
                      <div className="ui-micro-label mb-1">{label}</div>
                      <AddAttrInline
                        projectId={projectId}
                        presetKey={key}
                        presetPlaceholder={placeholder}
                        onSaved={() => { setAddingKey(null); setShowEmpty(false); onReload(); }}
                        onCancel={() => setAddingKey(null)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingKey(key)}
                    className="flex min-h-9 w-full items-center gap-1.5 py-1.5 text-left ui-link-muted"
                    >
                      <Plus className="h-3 w-3 shrink-0" />
                      <span className="font-medium text-text-tertiary">{label}</span>
                      <span className="text-text-muted italic ml-1">— {placeholder}</span>
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setShowEmpty(false)} className="text-micro text-text-muted hover:text-text-secondary transition-colors mt-1">
                Collapse
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowEmpty(true)}
              className="ui-link-subtle flex min-h-9 items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {missingSuggested.map((s) => s.label.toLowerCase()).join(", ")}
            </button>
          )}
        </div>
      )}

      {!data.readonly && (addingKey === "__custom__" ? (
        <div className="pt-1">
          <AddAttrInline
            projectId={projectId}
            onSaved={() => { setAddingKey(null); onReload(); }}
            onCancel={() => setAddingKey(null)}
          />
        </div>
      ) : (
        <button
          onClick={() => setAddingKey("__custom__")}
          className="flex min-h-9 items-center gap-1.5 text-xs text-text-tertiary transition-colors hover:text-status-positive"
        >
          <Plus className="h-3.5 w-3.5" /> Add custom attribute
        </button>
      ))}

      {data.relations.filter((r) => r.targetType === ENTITY_TYPE.PERSON).length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 ui-micro-label mb-2 font-medium">
            <Users className="h-3 w-3" /> People
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.relations
              .filter((r) => r.targetType === ENTITY_TYPE.PERSON)
              .map((r, i) => (
                <span key={i} className="ui-tag ui-tag-neutral">
                  {r.targetName}
                </span>
              ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-1.5 ui-micro-label mb-2 font-medium">
          <MessageSquare className="h-3 w-3" /> Recent Activity
        </div>
        <div className="space-y-3">
          {activityList.map((i, idx) => {
            const ChannelIcon = CHANNEL_ICON[i.channel] ?? Circle;
            return (
              <div key={idx} className="text-xs">
                <div className="flex items-center gap-1.5 text-text-tertiary mb-0.5">
                  <ChannelIcon className="h-3 w-3 shrink-0" />
                  <span className="capitalize">{i.channel.replace(/-/g, " ")}</span>
                  <span className="text-text-muted">·</span>
                  <span>{new Date(i.occurredAt).toLocaleDateString(APP_LOCALE)}</span>
                </div>
                {i.summary && <p className="text-text-secondary leading-relaxed">{i.summary}</p>}
              </div>
            );
          })}
          {activityList.length === 0 && !loggingActivity && (
            <p className="text-xs text-text-secondary">No activity recorded yet.</p>
          )}
        </div>

        {loggingActivity ? (
          <div className="mt-3 space-y-2 pt-2 border-t border-border-subtle">
            <div className="flex gap-2">
              <select
                value={actChannel}
                onChange={(e) => setActChannel(e.target.value)}
                className="flex-1 ui-input-tight"
              >
                {CHANNEL_CONFIG.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
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
              <button
                onClick={handleLogActivity}
                disabled={actSaving}
                className="ui-btn-save"
              >
                {actSaving ? <Loader2 className="ui-spinner-xs" /> : "Save"}
              </button>
              <button onClick={() => { setLoggingActivity(false); setActError(null); }} className="ui-btn-text-cancel">
                Cancel
              </button>
            </div>
          </div>
        ) : !data.readonly && (
          <button
            onClick={() => setLoggingActivity(true)}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-status-positive transition-colors mt-2"
          >
            <Plus className="h-3.5 w-3.5" /> Log activity
          </button>
        )}
      </div>

      {data.devLog.length > 0 && (
        <DevLogSection entries={data.devLog} />
      )}

      {data.activity.length > 0 && (
        <ProjectHistorySection events={data.activity} />
      )}

      <ClaudeSession tabName={data.runtimeState?.tabName ?? data.name} />
    </div>
  );
}

