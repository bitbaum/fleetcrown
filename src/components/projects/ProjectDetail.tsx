"use client";

import { useEffect, useState } from "react";
import {
  X,
  ExternalLink,
  Globe,
  GitBranch,
  AlertTriangle,
  ShieldAlert,
  Bot,
  Plus,
  Save,
  Users,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

type LinkedJob = {
  id: string;
  name: string;
  message: string;
  enabled: boolean;
  schedule: string;
  lastStatus?: string;
  consecutiveErrors?: number;
};

type ProjectDetailData = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  source: string | null;
  attrs: Record<string, string>;
  relations: Array<{
    type: string;
    strength: number | null;
    targetId: string;
    targetName: string;
    targetType: string;
  }>;
  interactions: Array<{
    channel: string;
    direction: string;
    summary: string | null;
    occurredAt: string;
  }>;
  linkedJobs: LinkedJob[];
};

// Keys to show prominently at the top
const KEY_ATTRS = ["status", "maturity", "stack", "architecture", "domain", "hosting", "owner"];
// Keys that are links (rendered as quick-link badges in header)
const LINK_ATTRS = ["production_url", "repo", "github_repo", "url"];
// Keys to show as warning cards
const ISSUE_ATTRS = ["broken_features", "security_vulnerability", "deployment_issue"];

function StatusBadge({ value }: { value: string }) {
  const isProduction = value.toLowerCase().includes("production");
  const isEarly = value.toLowerCase().includes("early") || value.toLowerCase().includes("planning") || value.toLowerCase().includes("blueprint");
  const cls = isProduction
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : isEarly
    ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"
    : "bg-blue-500/15 text-blue-400 border-blue-500/25";
  return (
    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-medium ${cls}`}>
      {value}
    </span>
  );
}

function MaturityBar({ value }: { value: string }) {
  const match = value.match(/^(\d+)\/10/);
  const score = match ? parseInt(match[1]) : null;
  if (score === null) return <span className="text-white/60 text-xs">{value}</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 w-3 rounded-sm ${
              i < score
                ? score >= 8 ? "bg-emerald-500" : score >= 5 ? "bg-yellow-500" : "bg-red-500"
                : "bg-white/10"
            }`}
          />
        ))}
      </div>
      <span className="text-white/40 text-[10px]">{value}</span>
    </div>
  );
}

function AddAttrForm({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!key.trim() || !value.trim() || saving) return;
    setSaving(true);
    await fetch(`/api/projects/${projectId}/attrs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSaving(false);
    setKey("");
    setValue("");
    onSaved();
  };

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
      <div className="text-[10px] text-white/30 uppercase tracking-wider">Add Attribute</div>
      <div className="flex gap-2">
        <input
          placeholder="key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25"
        />
        <input
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="flex-[2] bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25"
        />
        <button
          onClick={save}
          disabled={!key.trim() || !value.trim() || saving}
          className="px-2.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white transition-colors shrink-0"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function NewJobForm({ projectName, onCreated }: { projectName: string; onCreated: (job: LinkedJob) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${projectName} — `);
  const [schedule, setSchedule] = useState("0 9 * * 1");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || !schedule.trim() || !message.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/crons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scheduleExpr: schedule, message }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      onCreated({
        id: data.job.id,
        name: data.job.name,
        message: data.job.payload.message,
        enabled: data.job.enabled,
        schedule: data.job.schedule.expr,
        lastStatus: undefined,
        consecutiveErrors: 0,
      });
      setOpen(false);
      setMessage("");
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-emerald-400 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        New autopilot job for this project
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider">New Autopilot Job</div>
        <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <input
        placeholder="Job name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25"
      />
      <input
        placeholder="Cron schedule (e.g. 0 9 * * 1 = Mon 9am)"
        value={schedule}
        onChange={(e) => setSchedule(e.target.value)}
        className="w-full bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/20 font-mono focus:outline-none focus:border-white/25"
      />
      <textarea
        placeholder="Prompt / instructions for Ivy…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        className="w-full bg-white/[0.04] border border-white/10 rounded px-2.5 py-2 text-xs text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-white/25"
      />
      <button
        onClick={create}
        disabled={!name.trim() || !schedule.trim() || !message.trim() || saving}
        className="w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Create Job
      </button>
    </div>
  );
}

function JobRow({ job, onToggle }: { job: LinkedJob; onToggle: (id: string, enabled: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = (job.consecutiveErrors ?? 0) > 0;

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
          hasError ? "bg-red-500" : job.enabled ? "bg-emerald-500" : "bg-white/20"
        }`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-white/80 truncate">{job.name}</div>
          <div className="text-[10px] text-white/30 font-mono mt-0.5">{job.schedule}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(job.id, !job.enabled); }}
            className="text-white/30 hover:text-white/70 transition-colors"
          >
            {job.enabled ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4" />}
          </button>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-white/20" /> : <ChevronDown className="h-3.5 w-3.5 text-white/20" />}
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-wider mt-2.5 mb-1.5">Prompt</div>
          <pre className="text-[11px] text-white/50 whitespace-pre-wrap leading-relaxed font-mono bg-black/20 rounded p-2.5 max-h-48 overflow-y-auto">
            {job.message}
          </pre>
          {hasError && (
            <div className="mt-2 text-[10px] text-red-400/70 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {job.consecutiveErrors} consecutive error{(job.consecutiveErrors ?? 0) > 1 ? "s" : ""} · last status: {job.lastStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProjectDetail({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProjectDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddAttr, setShowAddAttr] = useState(false);
  const [jobs, setJobs] = useState<LinkedJob[]>([]);

  const reload = () => {
    setLoading(true);
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((d: ProjectDetailData) => {
        setData(d);
        setJobs(d.linkedJobs ?? []);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [projectId]);

  const toggleJob = async (id: string, enabled: boolean) => {
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, enabled } : j));
    await fetch("/api/crons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
  };

  const prodUrl = data?.attrs["production_url"] ?? data?.attrs["url"];
  const repo = data?.attrs["repo"] ?? data?.attrs["github_repo"];

  // Partition attrs
  const keyAttrs = KEY_ATTRS.filter((k) => data?.attrs[k]);
  const issueAttrs = ISSUE_ATTRS.filter((k) => data?.attrs[k]);
  const otherAttrs = Object.keys(data?.attrs ?? {}).filter(
    (k) => !LINK_ATTRS.includes(k) && !KEY_ATTRS.includes(k) && !ISSUE_ATTRS.includes(k)
  );
  const people = data?.relations.filter((r) => r.targetType === "person") ?? [];
  const otherRelations = data?.relations.filter((r) => r.targetType !== "person") ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0f1117] border-l border-white/10 overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0f1117] border-b border-white/10 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold">
                {loading ? "Loading…" : (data?.name ?? "Not found")}
              </div>
              {data?.description && (
                <div className="text-xs text-white/40 mt-0.5 leading-relaxed">{data.description}</div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {prodUrl && (
                <a href={prodUrl} target="_blank" rel="noreferrer"
                  className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors" title="Open live site">
                  <Globe className="h-4 w-4" />
                </a>
              )}
              {repo && (
                <a href={repo.startsWith("http") ? repo : `https://github.com/${repo}`}
                  target="_blank" rel="noreferrer"
                  className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors" title="Open repo">
                  <GitBranch className="h-4 w-4" />
                </a>
              )}
              <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors ml-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Status + Maturity quick badges */}
          {data && (
            <div className="flex flex-wrap gap-2 mt-3">
              {data.attrs["status"] && <StatusBadge value={data.attrs["status"]} />}
              {data.attrs["maturity"] && <MaturityBar value={data.attrs["maturity"]} />}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-white/20" />
          </div>
        ) : !data ? (
          <div className="p-5 text-white/30 text-sm">Project not found</div>
        ) : (
          <div className="flex-1 p-5 space-y-6">

            {/* Issues section */}
            {issueAttrs.length > 0 && (
              <section className="space-y-2">
                {data.attrs["security_vulnerability"] && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
                    <div className="flex items-center gap-1.5 text-red-400 text-[10px] uppercase tracking-wider font-medium mb-1.5">
                      <ShieldAlert className="h-3.5 w-3.5" /> Security Risk
                    </div>
                    <div className="text-xs text-red-300/70 leading-relaxed">{data.attrs["security_vulnerability"]}</div>
                  </div>
                )}
                {data.attrs["broken_features"] && (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/[0.04] p-3">
                    <div className="flex items-center gap-1.5 text-yellow-400 text-[10px] uppercase tracking-wider font-medium mb-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> Broken Features
                    </div>
                    <div className="text-xs text-yellow-300/70 leading-relaxed">{data.attrs["broken_features"]}</div>
                  </div>
                )}
                {data.attrs["deployment_issue"] && (
                  <div className="rounded-lg border border-orange-500/20 bg-orange-500/[0.04] p-3">
                    <div className="flex items-center gap-1.5 text-orange-400 text-[10px] uppercase tracking-wider font-medium mb-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> Deployment Issue
                    </div>
                    <div className="text-xs text-orange-300/70 leading-relaxed">{data.attrs["deployment_issue"]}</div>
                  </div>
                )}
              </section>
            )}

            {/* Intel section */}
            <section>
              <div className="text-[10px] uppercase tracking-wider text-white/30 mb-3">Intelligence</div>
              <div className="space-y-2">
                {keyAttrs
                  .filter((k) => k !== "status" && k !== "maturity")
                  .map((key) => (
                    <div key={key} className="flex items-start gap-3 text-xs">
                      <span className="text-white/25 w-24 shrink-0 pt-0.5 capitalize">{key.replace(/_/g, " ")}</span>
                      <span className="text-white/70 leading-relaxed">{data.attrs[key]}</span>
                    </div>
                  ))}
                {otherAttrs.map((key) => (
                  <div key={key} className="flex items-start gap-3 text-xs">
                    <span className="text-white/25 w-24 shrink-0 pt-0.5 capitalize">{key.replace(/_/g, " ")}</span>
                    {data.attrs[key].startsWith("http") ? (
                      <a href={data.attrs[key]} target="_blank" rel="noreferrer"
                        className="text-white/50 hover:text-white/80 underline underline-offset-2 truncate">
                        {data.attrs[key].replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span className="text-white/55 leading-relaxed">{data.attrs[key]}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Add attribute */}
              {showAddAttr ? (
                <AddAttrForm projectId={projectId} onSaved={() => { setShowAddAttr(false); reload(); }} />
              ) : (
                <button
                  onClick={() => setShowAddAttr(true)}
                  className="mt-3 flex items-center gap-1.5 text-xs text-white/30 hover:text-emerald-400 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add attribute
                </button>
              )}
            </section>

            {/* Autopilot section */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Bot className="h-3.5 w-3.5 text-white/30" />
                <div className="text-[10px] uppercase tracking-wider text-white/30">
                  Autopilot Jobs {jobs.length > 0 && <span className="text-white/20">({jobs.length})</span>}
                </div>
              </div>
              {jobs.length === 0 ? (
                <div className="text-xs text-white/25 mb-3">No autopilot jobs linked to this project yet.</div>
              ) : (
                <div className="space-y-2 mb-3">
                  {jobs.map((job) => (
                    <JobRow key={job.id} job={job} onToggle={toggleJob} />
                  ))}
                </div>
              )}
              <NewJobForm
                projectName={data.name}
                onCreated={(job) => setJobs((prev) => [...prev, job])}
              />
            </section>

            {/* People */}
            {people.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-3.5 w-3.5 text-white/30" />
                  <div className="text-[10px] uppercase tracking-wider text-white/30">People ({people.length})</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {people.map((p, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-xs text-white/60">
                      {p.targetName}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Other relations */}
            {otherRelations.length > 0 && (
              <section>
                <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Related</div>
                <div className="space-y-1">
                  {otherRelations.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-white/50">
                      <span className="text-white/25 capitalize">{r.type.replace(/_/g, " ")}</span>
                      <span className="text-white/60">{r.targetName}</span>
                      <span className="text-white/20 text-[10px]">{r.targetType}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent activity */}
            {data.interactions.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="h-3.5 w-3.5 text-white/30" />
                  <div className="text-[10px] uppercase tracking-wider text-white/30">Recent Activity</div>
                </div>
                <div className="space-y-3">
                  {data.interactions.map((interaction, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="text-white/25 mb-0.5">
                          {interaction.channel} · {new Date(interaction.occurredAt).toLocaleDateString()}
                        </div>
                        {interaction.summary && (
                          <div className="text-white/50 leading-relaxed">{interaction.summary}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.source && (
              <div className="text-[10px] text-white/15 pb-2">Source: {data.source}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
