"use client";

import { useState } from "react";
import { Check, Clock, Loader2, X } from "lucide-react";
import { createCronJob } from "@/lib/api/crons";
import type { PromptTemplate } from "@/config/prompt-library";
import type { Project } from "./types";
import { Modal } from "@/components/ui/modal";
import { FIELD_INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ui/form";

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
  const [schedule, setSchedule] = useState(template.suggestedSchedule ?? "0 9 * * 1");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const resolvedMessage =
    template.scope === "project" && projectName
      ? template.template.replaceAll("{{project_name}}", projectName)
      : template.template;

  const jobName =
    template.scope === "project" && projectName
      ? `${projectName} — ${template.name}`
      : template.name;

  const handleCreate = async () => {
    if (template.scope === "project" && !projectId) return;
    setSaving(true);
    await createCronJob({
      name: jobName,
      scheduleExpr: schedule,
      message: resolvedMessage,
      ...(projectId ? { projectId, projectName } : {}),
    });
    setSaving(false);
    setDone(true);
    setTimeout(onClose, 1200);
  };

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Schedule Job</div>
        <button onClick={onClose} className="p-1 text-white/40 hover:text-white/70 rounded">
          <X className="h-4 w-4" />
        </button>
      </div>

        <div className="text-xs text-white/50 bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
          <div className="font-medium text-white/70 mb-1">{template.name}</div>
          <div className="text-white/35">{template.description}</div>
        </div>

        {template.scope === "project" && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => {
                const p = projects.find((p) => p.id === e.target.value);
                setProjectId(e.target.value);
                setProjectName(p?.name ?? "");
              }}
              className={FIELD_INPUT_CLASS}
            >
              <option value="">— Select project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
            Schedule (cron)
          </label>
          <input
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className={`${FIELD_INPUT_CLASS} font-mono`}
            placeholder="0 9 * * 1"
          />
          <div className="text-[10px] text-white/25 mt-1">
            Examples: <code>0 9 * * 1</code> Mon 9am · <code>0 9 * * 1-5</code> Weekdays 9am · <code>0 18 * * 5</code> Fri 6pm
          </div>
        </div>

      <button
        onClick={handleCreate}
        disabled={saving || done || (template.scope === "project" && !projectId)}
        className={PRIMARY_BUTTON_CLASS}
      >
        {done ? (
          <><Check className="h-4 w-4" /> Scheduled!</>
        ) : saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
        ) : (
          <><Clock className="h-4 w-4" /> Create Scheduled Job</>
        )}
      </button>
    </Modal>
  );
}
