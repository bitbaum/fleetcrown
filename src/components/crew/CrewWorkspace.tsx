"use client";

import { useCallback, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { getJson } from "@/lib/api/fetch";
import {
  CLOSED_HUMAN_TASK_STATUSES,
  HUMAN_TASK_STATUS_LABEL,
  HUMAN_TASK_STATUS_ORDER,
  isWaitingOnOperator,
  type HumanTaskStatus,
} from "@/config/crew";
import type { CrewMember } from "@/db/queries/crew";
import type { HumanTaskRow } from "@/db/queries/human-tasks";
import { AssignmentCard } from "./AssignmentCard";
import { CrewRoster } from "./CrewRoster";
import { NewAssignmentButton, type ProjectOption } from "./NewAssignmentButton";

type Summary = { members: number; openTasks: number; waitingOnThem: number; waitingOnYou: number };

/**
 * The crew page.
 *
 * It answers one question at the top — is anyone waiting on ME — and only then
 * shows the work. Assignments group by status in the order work actually
 * travels, and the closed ones stay folded away: a board that shows every
 * finished favour from March is a board nobody reads in April.
 */
export function CrewWorkspace({
  initialTasks,
  initialCrew,
  initialSummary,
  projects,
}: {
  initialTasks: HumanTaskRow[];
  initialCrew: CrewMember[];
  initialSummary: Summary;
  projects: ProjectOption[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [crew, setCrew] = useState(initialCrew);
  const [summary, setSummary] = useState(initialSummary);
  const [showClosed, setShowClosed] = useState(false);
  // Set when "Assign work" is clicked on a roster card, so the modal opens with
  // that person already chosen. Keyed so the form remounts per person.
  const [assignTo, setAssignTo] = useState<CrewMember | null>(null);

  const refresh = useCallback(async () => {
    const [taskData, crewData] = await Promise.all([
      getJson<{ tasks: HumanTaskRow[] }>("/api/crew/tasks").catch(() => null),
      getJson<{ crew: CrewMember[]; summary: Summary }>("/api/crew").catch(() => null),
    ]);
    if (taskData) setTasks(taskData.tasks);
    if (crewData) {
      setCrew(crewData.crew);
      setSummary(crewData.summary);
    }
  }, []);

  const grouped = useMemo(() => {
    const byStatus = new Map<HumanTaskStatus, HumanTaskRow[]>();
    for (const task of tasks) {
      const list = byStatus.get(task.status) ?? [];
      list.push(task);
      byStatus.set(task.status, list);
    }
    return byStatus;
  }, [tasks]);

  const answer =
    summary.waitingOnYou > 0
      ? `${summary.waitingOnYou} ${summary.waitingOnYou === 1 ? "assignment needs" : "assignments need"} you`
      : summary.waitingOnThem > 0
        ? "Nothing needs you"
        : "Nothing out with anyone";

  const sub =
    summary.waitingOnThem > 0
      ? `${summary.waitingOnThem} out with ${summary.members === 1 ? "your one person" : "your crew"}`
      : summary.members === 0
        ? "Add the people you hand work to"
        : "The board is clear";

  return (
    <div className="space-y-7">
      <div className="ui-crew-hero">
        <span className="ui-crew-hero-answer">{answer}</span>
        <span className="ui-crew-hero-sub">{sub}</span>
        <span className="ml-auto">
          <NewAssignmentButton crew={crew} projects={projects} onCreated={refresh} />
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="ui-empty-panel">
          <ClipboardList className="h-8 w-8" />
          <div className="text-base text-text-secondary">No assignments yet</div>
          <p className="max-w-md text-center text-sm text-text-tertiary">
            Some work is not an agent&apos;s to do — calls to make, a room to walk
            into, a signature. Write the ask, hand it to a person, and watch the
            same board you watch your agents on.
          </p>
          <NewAssignmentButton crew={crew} projects={projects} onCreated={refresh} triggerLabel="Write the first ask" />
        </div>
      ) : (
        <section className="space-y-5">
          {HUMAN_TASK_STATUS_ORDER.filter(
            (status) => !CLOSED_HUMAN_TASK_STATUSES.includes(status),
          ).map((status) => {
            const list = grouped.get(status) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={status} className="ui-crew-group">
                <h2 className="ui-crew-group-label">
                  {HUMAN_TASK_STATUS_LABEL[status]}
                  <span className="tabular-nums">{list.length}</span>
                  {isWaitingOnOperator(status) && <span className="ui-dot ui-dot-warning" />}
                </h2>
                {list.map((task) => (
                  <AssignmentCard key={task.id} task={task} onChanged={refresh} />
                ))}
              </div>
            );
          })}

          <ClosedSection
            grouped={grouped}
            open={showClosed}
            onToggle={() => setShowClosed((v) => !v)}
            onChanged={refresh}
          />
        </section>
      )}

      <CrewRoster crew={crew} onChanged={refresh} onAssign={setAssignTo} />

      {assignTo && (
        <AssignFromRoster
          key={assignTo.id}
          member={assignTo}
          crew={crew}
          projects={projects}
          onDone={() => {
            setAssignTo(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ClosedSection({
  grouped,
  open,
  onToggle,
  onChanged,
}: {
  grouped: Map<HumanTaskStatus, HumanTaskRow[]>;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const closed = CLOSED_HUMAN_TASK_STATUSES.flatMap((status) => grouped.get(status) ?? []);
  if (closed.length === 0) return null;

  return (
    <div className="ui-crew-group">
      <button type="button" onClick={onToggle} className="ui-crew-group-label">
        Closed
        <span className="tabular-nums">{closed.length}</span>
        <span className="text-text-tertiary">{open ? "hide" : "show"}</span>
      </button>
      {open && closed.map((task) => (
        <AssignmentCard key={task.id} task={task} onChanged={onChanged} />
      ))}
    </div>
  );
}

/**
 * The roster's "Assign work" shortcut. It renders the same modal form with the
 * person pre-selected and opened — one component for writing an ask, whether
 * you started from the board or from a face.
 */
function AssignFromRoster({
  member,
  crew,
  projects,
  onDone,
}: {
  member: CrewMember;
  crew: CrewMember[];
  projects: ProjectOption[];
  onDone: () => void;
}) {
  return (
    <div className="ui-crew-share">
      <span className="text-sm text-text-secondary">Assigning to {member.name}</span>
      <span className="ml-auto flex items-center gap-2">
        <NewAssignmentButton
          crew={crew}
          projects={projects}
          defaultAssigneeId={member.id}
          defaultOpen
          triggerLabel={`Write an ask for ${member.name}`}
          onCreated={onDone}
        />
        <button type="button" onClick={onDone} className="ui-btn-xs">Cancel</button>
      </span>
    </div>
  );
}
