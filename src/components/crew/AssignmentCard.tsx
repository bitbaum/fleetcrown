"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Link2, Trash2, Wallet, X } from "lucide-react";
import { deleteJson, getJson, patchJson, postJson } from "@/lib/api/fetch";
import { deadlineLabel } from "@/lib/dates";
import {
  HUMAN_TASK_STATUS,
  HUMAN_TASK_STATUS_HINT,
  HUMAN_TASK_STATUS_LABEL,
  HUMAN_TASK_STATUS_TONE,
  OPERATOR_MOVES,
  TASK_ACTOR,
  formatFee,
  formatSats,
  isWaitingOnAssignee,
  type HumanTaskStatus,
} from "@/config/crew";
import type { HumanTaskDetail, HumanTaskRow } from "@/db/queries/human-tasks";

/** Verbs, not status names: the button says what you are doing to the ask. */
const MOVE_LABEL: Record<HumanTaskStatus, string> = {
  [HUMAN_TASK_STATUS.DRAFT]:     "Pull back to draft",
  [HUMAN_TASK_STATUS.ASSIGNED]:  "Hand over",
  [HUMAN_TASK_STATUS.ACCEPTED]:  "Send back for more",
  [HUMAN_TASK_STATUS.DECLINED]:  "They declined",
  [HUMAN_TASK_STATUS.DELIVERED]: "Mark delivered",
  [HUMAN_TASK_STATUS.DONE]:      "Accept the work",
  [HUMAN_TASK_STATUS.CANCELLED]: "Call it off",
};

function StatusTag({ status }: { status: HumanTaskStatus }) {
  return (
    <span className={`ui-tag ui-tag-${HUMAN_TASK_STATUS_TONE[status]}`}>
      {HUMAN_TASK_STATUS_LABEL[status]}
    </span>
  );
}

export function AssignmentCard({
  task,
  onChanged,
}: {
  task: HumanTaskRow;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<HumanTaskDetail | null>(null);
  const [copied, setCopied] = useState(false);

  const current = detail ?? task;

  // The timeline is the reason to open a row at all — it carries the note they
  // typed when they declined, which the status alone has lost. Fetched on first
  // open rather than with the board: 200 rows of history nobody has expanded is
  // the kind of payload that makes a page feel slow on a phone.
  useEffect(() => {
    if (!open || detail) return;
    let cancelled = false;
    getJson<{ task: HumanTaskDetail }>(`/api/crew/tasks/${task.id}`)
      .then((data) => { if (!cancelled) setDetail(data.task); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, detail, task.id]);
  const due = current.dueDate ? deadlineLabel(current.dueDate) : null;
  const fee = formatFee(current.feeAmount, current.feeCurrency);
  const sats = formatSats(current.feeAmount, current.feeCurrency);
  const owed = current.feeAmount !== null && current.feeAmount > 0;
  const shareUrl = current.sharePath
    ? `${typeof window === "undefined" ? "" : window.location.origin}${current.sharePath}`
    : null;

  async function run(action: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.error ?? "That didn't work.");
        return;
      }
      if (data.task) setDetail(data.task as HumanTaskDetail);
      onChanged();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const move = (status: HumanTaskStatus) =>
    run(() => patchJson(`/api/crew/tasks/${current.id}`, { status }));

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`ui-crew-task ${isWaitingOnAssignee(current.status) ? "ui-crew-task-waiting" : ""}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="ui-crew-task-head">
        <span className="min-w-0 flex-1">
          <span className="ui-crew-task-title block">{current.title}</span>
          <span className="ui-crew-task-meta">
            <span>{current.assigneeName ?? "Nobody assigned"}</span>
            {current.projectName && <span>· {current.projectName}</span>}
            {due && <span className={due.overdue ? "text-status-negative" : ""}>· {due.label}</span>}
            {fee && <span>· {fee}{sats ? ` (${sats})` : ""}</span>}
            {current.sharePath && <span>· link live</span>}
          </span>
        </span>
        <StatusTag status={current.status} />
        <ChevronDown className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="ui-crew-task-body">
          <p className="text-xs text-text-muted">{HUMAN_TASK_STATUS_HINT[current.status]}</p>

          {current.brief && <p className="ui-crew-task-prose">{current.brief}</p>}
          {current.reason && (
            <p className="ui-crew-task-prose">
              <span className="ui-micro-label mr-1">Why</span>
              {current.reason}
            </p>
          )}

          {shareUrl ? (
            <div className="ui-crew-share">
              <Link2 className="h-4 w-4 shrink-0 text-text-tertiary" />
              <span className="ui-crew-share-url">{shareUrl}</span>
              <button type="button" onClick={copyLink} className="ui-btn-xs">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => deleteJson(`/api/crew/tasks/${current.id}/share`))}
                className="ui-btn-xs"
              >
                <X className="h-3.5 w-3.5" />
                Revoke
              </button>
            </div>
          ) : (
            <p className="text-xs text-text-muted">
              {current.assigneeId
                ? "Not handed over yet. Hand it over to get a link you can send them."
                : "Nobody is assigned — pick someone before handing this over."}
            </p>
          )}

          {owed && (
            current.assigneePayUrl ? (
              // The money goes to THEIR OrangeCat profile, where their Lightning
              // wallet lives — never to the studio's listing of the work.
              <a
                href={current.assigneePayUrl}
                target="_blank"
                rel="noreferrer"
                className="ui-btn-secondary w-fit"
              >
                <Wallet className="h-4 w-4" />
                Pay {current.assigneeName ?? "them"} {fee}
              </a>
            ) : (
              <p className="text-xs text-status-warning">
                {current.assigneeName ?? "They"} has no OrangeCat profile on file, so
                there is nowhere to send {fee}. Add it on their crew card.
              </p>
            )
          )}

          {current.orangecatUrl && (
            <a href={current.orangecatUrl} target="_blank" rel="noreferrer" className="ui-btn-xs w-fit">
              <ExternalLink className="h-3.5 w-3.5" />
              Listed on OrangeCat
            </a>
          )}

          <div className="ui-crew-actions">
            {!current.sharePath && current.assigneeId && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => postJson(`/api/crew/tasks/${current.id}/share`, {}))}
                className="ui-btn-primary"
              >
                Hand over
              </button>
            )}
            {(OPERATOR_MOVES[current.status] ?? [])
              // "Hand over" is the share button above — one act, one button.
              .filter((next) => next !== HUMAN_TASK_STATUS.ASSIGNED)
              .map((next) => (
                <button
                  key={next}
                  type="button"
                  disabled={busy}
                  onClick={() => move(next)}
                  className={next === HUMAN_TASK_STATUS.DONE ? "ui-btn-secondary" : "ui-btn-chip"}
                >
                  {MOVE_LABEL[next]}
                </button>
              ))}
            {current.feeAmount !== null && !current.orangecatServiceId && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => postJson(`/api/crew/tasks/${current.id}/publish`, {}))}
                className="ui-btn-chip"
              >
                List on OrangeCat
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => deleteJson(`/api/crew/tasks/${current.id}`))}
              className="ui-btn-xs ml-auto"
              aria-label="Delete assignment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {detail?.timeline && detail.timeline.length > 0 && (
            <div className="ui-crew-timeline">
              {detail.timeline.map((entry) => (
                <div key={entry.id} className="ui-crew-timeline-row">
                  <span className="ui-micro-label">
                    {entry.actor === TASK_ACTOR.ASSIGNEE ? current.assigneeName ?? "They" : entry.actor}
                  </span>
                  <span>
                    {entry.status ? HUMAN_TASK_STATUS_LABEL[entry.status] : entry.kind}
                    {entry.note ? ` — ${entry.note}` : ""}
                  </span>
                  <span className="ml-auto tabular-nums">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && <p className="ui-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
