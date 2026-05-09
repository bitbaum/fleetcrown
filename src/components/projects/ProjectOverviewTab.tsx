"use client";

import { useState } from "react";
import { Plus, Users, MessageSquare, AlertTriangle, ShieldAlert, Loader2, History } from "lucide-react";
import type { ProjectData } from "./project-detail-types";
import {
  ISSUE_ATTRS, RESERVED, SUGGESTED_ATTRS, PROJECT_CHANNELS,
  SUGGESTED_ATTR_LABELS, SUGGESTED_ATTR_PLACEHOLDERS,
} from "./project-detail-types";
import { DevLogList } from "@/components/shared/DevLogList";
import { AddAttrInline, AttrRow, ClaudeSession } from "./project-overview-helpers";
import { postJson } from "@/lib/api/fetch";
import { toLocalDateStr } from "@/lib/dates";
import { ENTITY_TYPE, INTERACTION_DIRECTION } from "@/lib/constants/statuses";
import type { LucideProps } from "lucide-react";

type IssueConfig = {
  key: string;
  icon: React.ComponentType<LucideProps>;
  label: string;
  border: string; bg: string; text: string; body: string;
};

const ISSUE_DISPLAY: IssueConfig[] = [
  { key: "security_vulnerability", icon: ShieldAlert, label: "Security Risk",
    border: "border-status-negative/25",    bg: "bg-status-negative-subtle",    text: "text-status-negative",    body: "text-status-negative/70" },
  { key: "broken_features",        icon: AlertTriangle, label: "Broken Features",
    border: "border-status-warning/25", bg: "bg-status-warning-subtle", text: "text-status-warning", body: "text-status-warning/70" },
  { key: "deployment_issue",       icon: AlertTriangle, label: "Deployment Issue",
    border: "border-status-warning/25", bg: "bg-status-warning-subtle", text: "text-status-warning", body: "text-status-warning/70" },
];

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
  const [actChannel, setActChannel] = useState<string>(PROJECT_CHANNELS[0]);
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
      <ClaudeSession projectName={data.name} />

      {ISSUE_ATTRS.some((k) => attrs[k]) && (
        <div className="space-y-2">
          {ISSUE_DISPLAY.filter((cfg) => attrs[cfg.key]).map(({ key, icon: Icon, label, border, bg, text, body }) => (
            <div key={key} className={`ui-card-shell ${border} ${bg} p-3`}>
              <div className={`flex items-center gap-1.5 ${text} text-[10px] uppercase tracking-wider font-semibold mb-1.5`}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </div>
              <p className={`text-xs ${body} leading-relaxed`}>{attrs[key]}</p>
            </div>
          ))}
        </div>
      )}

      {displayAttrs.length > 0 ? (
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
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-secondary italic">No details recorded yet.</p>
      )}

      {missingSuggested.length > 0 && (
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
              <button onClick={() => setShowEmpty(false)} className="text-[10px] text-text-muted hover:text-text-secondary transition-colors mt-1">
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

      {addingKey === "__custom__" ? (
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
      )}

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
          {activityList.map((i, idx) => (
            <div key={idx} className="text-xs">
              <div className="text-text-tertiary mb-0.5">
                {i.channel} · {new Date(i.occurredAt).toLocaleDateString()}
              </div>
              {i.summary && <p className="text-text-secondary leading-relaxed">{i.summary}</p>}
            </div>
          ))}
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
                {PROJECT_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
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
        ) : (
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
    </div>
  );
}

function DevLogSection({ entries }: { entries: import("./project-detail-types").DevLogEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors py-1"
      >
        <History className="h-3.5 w-3.5" />
        Session Log ({entries.length})
        <span className="ml-0.5">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-2">
          <DevLogList entries={entries} />
        </div>
      )}
    </div>
  );
}
