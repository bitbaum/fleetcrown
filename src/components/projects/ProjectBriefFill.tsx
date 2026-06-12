"use client";

// The "no forms" intake. Instead of clicking through mission/vision/customers
// field by field, the user writes (or dictates via OS dictation) what the
// project should be — or pulls the answer straight from the repo's README —
// and AI fills the profile. Both paths land in the same SSOT the inline
// editors write to, so a wrong guess is one click from fixable.

import { useState } from "react";
import { GitBranch, Loader2, Sparkles } from "lucide-react";
import { postJson } from "@/lib/api/fetch";

type AppliedFields = Record<string, string>;

export function ProjectBriefFill({
  projectId,
  hasRepo,
  onReload,
}: {
  projectId: string;
  /** Whether a GitHub repo is linked (gates the "Fill from repo" button). */
  hasRepo: boolean;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"brief" | "enrich" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedKeys, setAppliedKeys] = useState<string[] | null>(null);

  async function run(kind: "brief" | "enrich") {
    setBusy(kind);
    setError(null);
    setAppliedKeys(null);
    try {
      const res = await postJson(
        `/api/projects/${projectId}/${kind}`,
        kind === "brief" ? { text } : {},
      );
      const json = await res.json() as { ok?: boolean; applied?: AppliedFields; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setAppliedKeys(Object.keys(json.applied ?? {}));
      setText("");
      setOpen(false);
      onReload();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!open && (
          <button
            onClick={() => { setOpen(true); setAppliedKeys(null); }}
            className="ui-btn-chip gap-1.5 px-3 py-1.5 text-xs"
            title="Write what this project is and should become, in your own words — AI fills mission, vision, customers, stack and next step for you."
          >
            <Sparkles className="h-3.5 w-3.5 text-accent-text" />
            Describe it — AI fills the profile
          </button>
        )}
        {hasRepo && (
          <button
            onClick={() => run("enrich")}
            disabled={busy !== null}
            className="ui-btn-chip gap-1.5 px-3 py-1.5 text-xs"
            title="Read the repo's README (and CLAUDE.md) and fill the profile from it."
          >
            {busy === "enrich" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5 text-accent-text" />}
            Fill from repo
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-raised p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            rows={4}
            maxLength={8000}
            placeholder="Free form — what is this project, who is it for, what should it become, what's next? Paste notes, dictate, anything. AI sorts it into the profile."
            className="w-full ui-input text-xs leading-relaxed"
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => run("brief")}
              disabled={busy !== null || text.trim().length < 10}
              className="ui-btn-save gap-1.5"
            >
              {busy === "brief" ? <Loader2 className="ui-spinner-xs" /> : <Sparkles className="h-3.5 w-3.5" />}
              Fill profile
            </button>
            <button onClick={() => { setOpen(false); setError(null); }} className="ui-btn-text-cancel">
              Cancel
            </button>
          </div>
        </div>
      )}

      {appliedKeys && appliedKeys.length > 0 && (
        <p className="text-xs text-status-positive">
          Filled: {appliedKeys.map((k) => k.replace(/_/g, " ")).join(", ")}. Click any field to adjust.
        </p>
      )}
      {error && <p className="ui-error-xs">{error}</p>}
    </div>
  );
}
