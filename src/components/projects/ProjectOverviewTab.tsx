"use client";

import { useState, useEffect } from "react";
import { Plus, Users, MessageSquare, AlertTriangle, ShieldAlert, Loader2, Terminal } from "lucide-react";
import type { ProjectData } from "./project-detail-types";
import { ISSUE_ATTRS, RESERVED, SUGGESTED_ATTRS, PROJECT_CHANNELS } from "./project-detail-types";
import { AddAttrInline, AttrRow } from "./project-overview-helpers";
import { FIELD_INPUT_CLASS_TIGHT } from "@/components/ui/form";
import { getJson, postJson } from "@/lib/api/fetch";
import { toLocalDateStr } from "@/lib/dates";
import { ENTITY_TYPE, INTERACTION_DIRECTION } from "@/lib/constants/statuses";
import type { SessionData } from "@/app/api/sessions/route";

// ─── ClaudeSession ────────────────────────────────────────────────────────────

function ClaudeSession({ projectName }: { projectName: string }) {
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    getJson<SessionData>(`/api/sessions?project=${encodeURIComponent(projectName)}`)
      .then((d) => setSession(d))
      .catch(() => {});
  }, [projectName]);

  if (!session || !session.found) return null;

  const healthColor = session.health.startsWith("green") || session.health.startsWith("good")
    ? "text-emerald-400"
    : session.health.startsWith("red") || session.health.toLowerCase().includes("fail")
    ? "text-red-400"
    : "text-amber-400";

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/25 font-medium">
        <Terminal className="h-3 w-3" /> Claude Session
      </div>
      {session.done && (
        <div>
          <div className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Done</div>
          <p className="text-xs text-white/55 leading-relaxed line-clamp-3">{session.done}</p>
        </div>
      )}
      {session.next && (
        <div>
          <div className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Next</div>
          <p className="text-xs text-white/70 leading-relaxed line-clamp-3">{session.next}</p>
        </div>
      )}
      {session.todos && session.todos !== "0 TODOs" && session.todos !== "0" && (
        <div>
          <div className="text-[10px] text-amber-400/60 uppercase tracking-wider mb-0.5">Todos</div>
          <p className="text-xs text-amber-400/70 leading-relaxed line-clamp-2">{session.todos}</p>
        </div>
      )}
      <div className="flex items-center gap-4 pt-0.5">
        {session.tests && (
          <div className="text-[10px] text-white/35">{session.tests}</div>
        )}
        {session.health && (
          <div className={`text-[10px] font-medium ${healthColor}`}>{session.health.split("—")[0].trim()}</div>
        )}
      </div>
    </div>
  );
}

// ─── OverviewTab ──────────────────────────────────────────────────────────────

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

  const handleLogActivity = async () => {
    setActSaving(true);
    try {
      const res = await postJson(`/api/projects/${projectId}/interactions`, {
        channel: actChannel,
        direction: INTERACTION_DIRECTION.OUTBOUND,
        summary: actSummary || undefined,
        occurredAt: actDate,
      });
      const json = await res.json();
      if (json.ok) {
        setActivityList((prev) => [{ channel: actChannel, direction: INTERACTION_DIRECTION.OUTBOUND, summary: actSummary || null, occurredAt: actDate }, ...prev]);
        setLoggingActivity(false);
        setActSummary("");
        setActDate(toLocalDateStr(new Date()));
      }
    } finally {
      setActSaving(false);
    }
  };

  const attrs = data.attrs;
  const displayAttrs = Object.entries(attrs).filter(([k]) => !RESERVED.includes(k));
  const missingSuggested = SUGGESTED_ATTRS.filter(({ key }) => !attrs[key]);
  const suggestedLabel: Record<string, string> = Object.fromEntries(SUGGESTED_ATTRS.map(({ key, label }) => [key, label]));
  const suggestedPlaceholder: Record<string, string> = Object.fromEntries(SUGGESTED_ATTRS.map(({ key, placeholder }) => [key, placeholder]));

  return (
    <div className="space-y-5">
      {/* Claude session state — shown when a ~/.claude/sessions/<name>.md exists */}
      <ClaudeSession projectName={data.name} />

      {/* Issues — most critical, shown first */}
      {ISSUE_ATTRS.some((k) => attrs[k]) && (
        <div className="space-y-2">
          {attrs["security_vulnerability"] && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/[0.05] p-3">
              <div className="flex items-center gap-1.5 text-red-400 text-[10px] uppercase tracking-wider font-semibold mb-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Security Risk
              </div>
              <p className="text-xs text-red-300/70 leading-relaxed">{attrs["security_vulnerability"]}</p>
            </div>
          )}
          {attrs["broken_features"] && (
            <div className="rounded-lg border border-yellow-500/25 bg-yellow-500/[0.04] p-3">
              <div className="flex items-center gap-1.5 text-yellow-400 text-[10px] uppercase tracking-wider font-semibold mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Broken Features
              </div>
              <p className="text-xs text-yellow-300/70 leading-relaxed">{attrs["broken_features"]}</p>
            </div>
          )}
          {attrs["deployment_issue"] && (
            <div className="rounded-lg border border-orange-500/25 bg-orange-500/[0.04] p-3">
              <div className="flex items-center gap-1.5 text-orange-400 text-[10px] uppercase tracking-wider font-semibold mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Deployment Issue
              </div>
              <p className="text-xs text-orange-300/70 leading-relaxed">{attrs["deployment_issue"]}</p>
            </div>
          )}
        </div>
      )}

      {/* All present attributes */}
      {displayAttrs.length > 0 ? (
        <div>
          {displayAttrs.map(([key, value]) => (
            <AttrRow
              key={key}
              label={suggestedLabel[key] ?? key.replace(/_/g, " ")}
              value={value}
              projectId={projectId}
              attrKey={key}
              onReload={onReload}
              placeholder={suggestedPlaceholder[key]}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/25 italic">No details recorded yet.</p>
      )}

      {/* Missing suggested fields — collapsed by default */}
      {missingSuggested.length > 0 && (
        <div>
          {showEmpty ? (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-white/20 mb-2">Add missing context</div>
              {missingSuggested.map(({ key, label, placeholder }) => (
                <div key={key}>
                  {addingKey === key ? (
                    <div className="py-1">
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">{label}</div>
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
                      className="flex items-center gap-1.5 w-full text-left py-1.5 text-xs text-white/25 hover:text-white/50 transition-colors"
                    >
                      <Plus className="h-3 w-3 shrink-0" />
                      <span className="font-medium text-white/35">{label}</span>
                      <span className="text-white/20 italic ml-1">— {placeholder}</span>
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setShowEmpty(false)} className="text-[10px] text-white/30 hover:text-white/55 transition-colors mt-1">
                Collapse
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowEmpty(true)}
              className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {missingSuggested.map((s) => s.label.toLowerCase()).join(", ")}
            </button>
          )}
        </div>
      )}

      {/* Custom attribute */}
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
          className="flex items-center gap-1.5 text-xs text-white/35 hover:text-emerald-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add custom attribute
        </button>
      )}

      {/* People relations */}
      {data.relations.filter((r) => r.targetType === ENTITY_TYPE.PERSON).length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/25 mb-2 font-medium">
            <Users className="h-3 w-3" /> People
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.relations
              .filter((r) => r.targetType === ENTITY_TYPE.PERSON)
              .map((r, i) => (
                <span key={i} className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-xs text-white/55">
                  {r.targetName}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/25 mb-2 font-medium">
          <MessageSquare className="h-3 w-3" /> Recent Activity
        </div>
        <div className="space-y-3">
          {activityList.map((i, idx) => (
            <div key={idx} className="text-xs">
              <div className="text-white/25 mb-0.5">
                {i.channel} · {new Date(i.occurredAt).toLocaleDateString()}
              </div>
              {i.summary && <p className="text-white/50 leading-relaxed">{i.summary}</p>}
            </div>
          ))}
          {activityList.length === 0 && !loggingActivity && (
            <p className="text-xs text-white/30">No activity recorded yet.</p>
          )}
        </div>

        {loggingActivity ? (
          <div className="mt-3 space-y-2 pt-2 border-t border-white/[0.06]">
            <div className="flex gap-2">
              <select
                value={actChannel}
                onChange={(e) => setActChannel(e.target.value)}
                className={`flex-1 ${FIELD_INPUT_CLASS_TIGHT}`}
              >
                {PROJECT_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="date"
                value={actDate}
                onChange={(e) => setActDate(e.target.value)}
                className={FIELD_INPUT_CLASS_TIGHT}
              />
            </div>
            <input
              value={actSummary}
              onChange={(e) => setActSummary(e.target.value)}
              placeholder="What happened? (optional)"
              onKeyDown={(e) => { if (e.key === "Enter") handleLogActivity(); if (e.key === "Escape") setLoggingActivity(false); }}
              autoFocus
              className={`w-full ${FIELD_INPUT_CLASS_TIGHT}`}
            />
            <div className="flex gap-2">
              <button
                onClick={handleLogActivity}
                disabled={actSaving}
                className="px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium transition-colors flex items-center gap-1"
              >
                {actSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </button>
              <button onClick={() => setLoggingActivity(false)} className="text-xs text-white/30 hover:text-white/60 px-1">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setLoggingActivity(true)}
            className="flex items-center gap-1.5 text-xs text-white/35 hover:text-emerald-400 transition-colors mt-2"
          >
            <Plus className="h-3.5 w-3.5" /> Log activity
          </button>
        )}
      </div>
    </div>
  );
}
