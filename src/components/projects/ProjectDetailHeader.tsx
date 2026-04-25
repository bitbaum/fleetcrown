"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Globe, GitBranch, AlertTriangle, Loader2 } from "lucide-react";
import { MaturityBar, StatusBadge } from "./project-badges";
import { DeleteButton } from "@/components/ui/delete-button";
import { setAttr } from "@/lib/api/attrs";
import type { ProjectData, Tab } from "./project-detail-types";
import { LINK_ATTRS, ISSUE_ATTRS } from "./project-detail-types";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "prompts",  label: "Prompts" },
  { id: "goals",    label: "Goals" },
];

export function ProjectDetailHeader({
  data,
  loading,
  projectId,
  tab,
  setTab,
  onClose,
  onDeleteSuccess,
  jobCount,
  goalCount,
}: {
  data: ProjectData | null;
  loading: boolean;
  projectId: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
  onClose: () => void;
  onDeleteSuccess: () => void;
  jobCount: number;
  goalCount: number;
}) {
  const router = useRouter();

  const [nameOverride, setNameOverride] = useState<string | undefined>(undefined);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [descOverride, setDescOverride] = useState<string | null | undefined>(undefined);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);

  const [editingStatus, setEditingStatus] = useState(false);
  const [statusValue, setStatusValue] = useState("");
  const [statusOverride, setStatusOverride] = useState<string | undefined>(undefined);
  const [savingStatus, setSavingStatus] = useState(false);

  const [editingMaturity, setEditingMaturity] = useState(false);
  const [maturityScore, setMaturityScore] = useState(5);
  const [maturityOverride, setMaturityOverride] = useState<string | undefined>(undefined);
  const [savingMaturity, setSavingMaturity] = useState(false);

  const commitName = async () => {
    const trimmed = nameValue.trim();
    const current = nameOverride ?? data?.name ?? "";
    if (!trimmed || trimmed === current) { setEditingName(false); return; }
    setSavingName(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if ((await res.json()).ok) setNameOverride(trimmed);
    } finally { setSavingName(false); setEditingName(false); }
  };

  const commitDescription = async () => {
    const trimmed = descValue.trim();
    setSavingDesc(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed }),
      });
      if ((await res.json()).ok) setDescOverride(trimmed || null);
    } finally { setSavingDesc(false); setEditingDesc(false); }
  };

  const commitStatus = async () => {
    const trimmed = statusValue.trim();
    if (!trimmed) { setEditingStatus(false); return; }
    setSavingStatus(true);
    try {
      await setAttr(`/api/projects/${projectId}`, "status", trimmed);
      setStatusOverride(trimmed);
    } finally { setSavingStatus(false); setEditingStatus(false); }
  };

  const commitMaturity = async () => {
    const value = `${maturityScore}/10`;
    setSavingMaturity(true);
    try {
      await setAttr(`/api/projects/${projectId}`, "maturity", value);
      setMaturityOverride(value);
    } finally { setSavingMaturity(false); setEditingMaturity(false); }
  };

  const attrs = data?.attrs ?? {};
  const description = descOverride !== undefined ? descOverride : (data?.description ?? attrs["description"] ?? null);
  const owner = attrs["owner"] ?? null;
  const effectiveStatus = statusOverride ?? attrs["status"] ?? null;
  const effectiveMaturity = maturityOverride ?? attrs["maturity"] ?? null;
  const prodUrl = attrs[LINK_ATTRS[0]] ?? attrs[LINK_ATTRS[3]];
  const repo    = attrs[LINK_ATTRS[1]] ?? attrs[LINK_ATTRS[2]];
  const hasIssues = ISSUE_ATTRS.some((k) => attrs[k]);

  return (
    <div className="shrink-0 bg-surface-drawer border-b border-white/10">
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitName();
                    if (e.key === "Escape") { setEditingName(false); setNameValue(nameOverride ?? data?.name ?? ""); }
                  }}
                  onBlur={commitName}
                  autoFocus
                  className="text-base font-semibold bg-white/[0.06] border border-white/20 rounded px-2 py-0.5 focus:outline-none focus:border-white/35 w-48"
                />
                {savingName && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40 shrink-0" />}
              </div>
            ) : (
              <h2
                className={`text-base font-semibold truncate ${data && !loading ? "cursor-text hover:text-white/80 transition-colors" : ""}`}
                onClick={() => data && !loading && (setNameValue(nameOverride ?? data.name), setEditingName(true))}
                title={data && !loading ? "Click to rename" : undefined}
              >
                {loading ? "Loading…" : (nameOverride ?? data?.name ?? "Not found")}
              </h2>
            )}
            {owner && (
              <span className="text-[10px] text-white/25 border border-white/10 rounded px-1.5 py-0.5 shrink-0">{owner}</span>
            )}
          </div>

          {editingDesc ? (
            <div className="mt-1.5 space-y-1.5">
              <textarea
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setEditingDesc(false); setDescValue(description ?? ""); }
                  if (e.key === "Enter" && e.metaKey) commitDescription();
                }}
                autoFocus
                rows={2}
                placeholder="Add a description…"
                className="w-full bg-white/[0.04] border border-white/15 rounded px-2 py-1.5 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/30 resize-none transition-colors"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={commitDescription}
                  disabled={savingDesc}
                  className="px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium transition-colors flex items-center gap-1"
                >
                  {savingDesc ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </button>
                <button
                  onClick={() => { setEditingDesc(false); setDescValue(description ?? ""); }}
                  className="text-xs text-white/30 hover:text-white/60 px-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setDescValue(description ?? ""); setEditingDesc(true); }}
              className="w-full text-left text-xs text-white/40 hover:text-white/60 mt-0.5 leading-relaxed transition-colors"
              title="Click to edit description"
            >
              {description ?? <span className="italic text-white/20">Add a description…</span>}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {prodUrl && (
            <a href={prodUrl.startsWith("http") ? prodUrl : `https://${prodUrl}`}
              target="_blank" rel="noreferrer"
              className="p-1.5 rounded hover:bg-white/10 text-white/35 hover:text-white/70 transition-colors" title="Live site">
              <Globe className="h-4 w-4" />
            </a>
          )}
          {repo && (
            <a href={repo.startsWith("http") ? repo : `https://github.com/${repo}`}
              target="_blank" rel="noreferrer"
              className="p-1.5 rounded hover:bg-white/10 text-white/35 hover:text-white/70 transition-colors" title="Repository">
              <GitBranch className="h-4 w-4" />
            </a>
          )}
          {data && (
            <DeleteButton
              onDelete={async () => {
                await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
                onDeleteSuccess();
                router.refresh();
              }}
              label="Delete?"
              triggerTitle="Delete project"
              triggerClassName="ml-1 p-1.5 rounded text-white/20 hover:text-red-400 hover:bg-white/5 transition-colors"
            />
          )}
          <button onClick={onClose}
            className="ml-1 p-1.5 rounded hover:bg-white/10 text-white/35 hover:text-white/70 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Status + Maturity row */}
      {data && (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          {editingStatus ? (
            <div className="flex items-center gap-1.5">
              <input
                value={statusValue}
                onChange={(e) => setStatusValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commitStatus(); if (e.key === "Escape") setEditingStatus(false); }}
                onBlur={commitStatus}
                autoFocus
                placeholder="e.g. Production"
                className="bg-white/[0.06] border border-white/20 rounded px-2 py-0.5 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/35 w-36"
              />
              {savingStatus && <Loader2 className="h-3 w-3 animate-spin text-white/30 shrink-0" />}
            </div>
          ) : (
            <button
              onClick={() => { setStatusValue(effectiveStatus ?? ""); setEditingStatus(true); }}
              title="Click to edit status"
              className="flex items-center"
            >
              {effectiveStatus
                ? <StatusBadge value={effectiveStatus} />
                : <span className="text-[10px] text-white/20 hover:text-white/50 transition-colors border border-dashed border-white/15 rounded px-1.5 py-0.5">+ status</span>}
            </button>
          )}

          {editingMaturity ? (
            <div className="flex items-center gap-2">
              <input
                type="range" min={1} max={10} value={maturityScore}
                onChange={(e) => setMaturityScore(Number(e.target.value))}
                className="w-24 accent-emerald-500"
              />
              <span className="text-[10px] text-white/50 w-8">{maturityScore}/10</span>
              <button
                onClick={commitMaturity}
                disabled={savingMaturity}
                className="px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-[10px] transition-colors"
              >
                {savingMaturity ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </button>
              <button onClick={() => setEditingMaturity(false)} className="text-[10px] text-white/30 hover:text-white/60">✕</button>
            </div>
          ) : (
            <button
              onClick={() => {
                const match = effectiveMaturity?.match(/^(\d+)\/10/);
                setMaturityScore(match ? parseInt(match[1]) : 5);
                setEditingMaturity(true);
              }}
              title="Click to edit maturity"
              className="flex items-center"
            >
              {effectiveMaturity
                ? <MaturityBar value={effectiveMaturity} />
                : <span className="text-[10px] text-white/20 hover:text-white/50 transition-colors border border-dashed border-white/15 rounded px-1.5 py-0.5">+ maturity</span>}
            </button>
          )}

          {hasIssues && (
            <span className="flex items-center gap-1 text-[10px] text-red-400/70 ml-auto">
              <AlertTriangle className="h-3 w-3" /> Issues detected
            </span>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-t border-white/[0.06]">
        {TABS.map(({ id, label }) => {
          const badge = id === "prompts" ? jobCount : id === "goals" ? goalCount : undefined;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                tab === id
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-white/40 hover:text-white/70 hover:border-white/20"
              }`}
            >
              {label}
              {badge !== undefined && badge > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  tab === id ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/30"
                }`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
