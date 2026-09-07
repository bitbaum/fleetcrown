"use client";

import { useState } from "react";
import { Check, Clock, Loader2, X } from "lucide-react";
import { createCronJob } from "@/lib/api/crons";
import type { PromptTemplate } from "@/config/prompt-library";
import type { Project } from "./types";
import { Modal } from "@/components/ui/modal";
import { MODAL_AUTO_CLOSE_MS } from "@/lib/constants/timings";
import { renderPromptBody, parsePromptVariables } from "@/lib/prompt-vars";

export function ScheduleModal({
  template,
  projects,
  onClose,
}: {
  template: PromptTemplate;
  projects: Project[];
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState(template.suggestedSchedule ?? "0 9 * * 1");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A scheduled job stores its message as text, so whatever is unfilled here is
  // baked in and re-sent on every tick. Resolve EVERY declared variable, not
  // just project_name — a user-owned prompt reaching this modal through
  // asTemplate() used to schedule its braces verbatim, forever.
  const declared = parsePromptVariables(template.template);
  const extraVars = declared.filter((v) => v.name !== "project_name");
  const values: Record<string, string> = { ...varValues };
  if (projectName) values.project_name = projectName;
  const resolvedMessage = renderPromptBody(template.template, values);

  const jobName =
    template.scope === "project" && projectName
      ? `${projectName} — ${template.name}`
      : template.name;

  const handleCreate = async () => {
    if (template.scope === "project" && !projectId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createCronJob({
        name: jobName,
        scheduleExpr: schedule,
        message: resolvedMessage,
        ...(projectId ? { projectId, projectName } : {}),
      });
      if (!res.ok) {
        setError("Failed to create job — try again");
        return;
      }
      setDone(true);
      setTimeout(onClose, MODAL_AUTO_CLOSE_MS);
    } catch {
      setError("Network error — try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold text-text-primary">Schedule Job</div>
        <button onClick={onClose} className="ui-btn-overlay p-2">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="ui-card-shell p-4">
        <div className="mb-1 text-base font-medium text-text-primary">{template.name}</div>
        <div className="text-base text-text-secondary">{template.description}</div>
      </div>

      {template.scope === "project" && (
        <div>
          <label className="ui-kicker mb-2 block text-text-tertiary">Project</label>
          <select
            value={projectId}
            onChange={(e) => {
              const p = projects.find((p) => p.id === e.target.value);
              setProjectId(e.target.value);
              setProjectName(p?.name ?? "");
            }}
            className="ui-input"
          >
            <option value="">— Select project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {extraVars.length > 0 && (
        <div className="space-y-3">
          <div className="ui-kicker text-text-tertiary">Variables</div>
          {extraVars.map((v) => (
            <div key={v.name}>
              <label className="ui-micro-label mb-1 block" htmlFor={`sched-var-${v.name}`}>
                {v.name}
                {v.defaultValue !== undefined && (
                  <span className="text-text-muted"> · defaults to {v.defaultValue}</span>
                )}
              </label>
              <input
                id={`sched-var-${v.name}`}
                value={varValues[v.name] ?? ""}
                onChange={(e) => setVarValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                placeholder={v.defaultValue ?? `Value for ${v.name}`}
                className="ui-input"
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="ui-kicker mb-2 block text-text-tertiary">Schedule (cron)</label>
        <input
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          className={`ui-input font-mono`}
          placeholder="0 9 * * 1"
        />
        <div className="mt-2 text-sm text-text-tertiary">
          Examples: <code>0 9 * * 1</code> Mon 9am · <code>0 9 * * 1-5</code> Weekdays 9am ·{" "}
          <code>0 18 * * 5</code> Fri 6pm
        </div>
      </div>

      {error && <p className="ui-error-xs">{error}</p>}
      <button
        onClick={handleCreate}
        disabled={saving || done || (template.scope === "project" && !projectId)}
        className="ui-btn-submit"
      >
        {done ? (
          <>
            <Check className="h-4 w-4" /> Scheduled!
          </>
        ) : saving ? (
          <>
            <Loader2 className="ui-spinner" /> Creating…
          </>
        ) : (
          <>
            <Clock className="h-4 w-4" /> Create Scheduled Job
          </>
        )}
      </button>
    </Modal>
  );
}
