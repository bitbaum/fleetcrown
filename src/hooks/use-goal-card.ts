"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalWithChildren } from "@/db/queries/goals";
import type { Milestone } from "@/db/schema/goals";
import { patchGoal, createGoal } from "@/lib/api/goals";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import { useInlineEdit } from "./use-inline-edit";

export function useGoalCard(goal: GoalWithChildren) {
  const router = useRouter();
  const [status, setStatus] = useState(goal.status ?? GOAL_STATUS.ACTIVE);
  const [progress, setProgress] = useState(goal.progress ?? 0);
  const [milestones, setMilestones] = useState<Milestone[]>(goal.milestones ?? []);
  const [targetDate, setTargetDate] = useState<Date | null>(goal.targetDate);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [abandoningStatus, setAbandoningStatus] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description);
  const [addingChild, setAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [savingChild, setSavingChild] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);
  const titleEdit = useInlineEdit<string>(goal.title);
  const descEdit = useInlineEdit<string>(goal.description ?? "");

  const handleAddChild = async () => {
    const title = childTitle.trim();
    if (!title) return;
    setSavingChild(true);
    setChildError(null);
    try {
      const res = await createGoal({ title, parentGoalId: goal.id });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setChildTitle("");
        setAddingChild(false);
        router.refresh();
      } else {
        setChildError(data.error ?? "Failed to add sub-goal");
      }
    } catch {
      setChildError("Network error — try again");
    } finally {
      setSavingChild(false);
    }
  };

  const commitTitle = () => {
    const trimmed = titleEdit.draft.trim();
    if (!trimmed || trimmed === displayTitle) { titleEdit.cancel(); return; }
    setTitleError(null);
    titleEdit.commit(async () => {
      await patchGoal(goal.id, { title: trimmed });
      setDisplayTitle(trimmed);
    }).then((saved) => {
      if (!saved) {
        setTitleError("Failed to save — try again");
        setTimeout(() => setTitleError(null), 4000);
      }
    });
  };

  const commitDesc = () => {
    const trimmed = descEdit.draft.trim();
    setDescError(null);
    descEdit.commit(async () => {
      await patchGoal(goal.id, { description: trimmed || null });
      setDescription(trimmed || null);
    }).then((saved) => {
      if (!saved) {
        setDescError("Failed to save — try again");
        setTimeout(() => setDescError(null), 4000);
      }
    });
  };

  const toggleComplete = async () => {
    if (togglingStatus) return;
    setTogglingStatus(true);
    const newStatus = status === GOAL_STATUS.COMPLETED ? GOAL_STATUS.ACTIVE : GOAL_STATUS.COMPLETED;
    const newProgress = newStatus === GOAL_STATUS.COMPLETED ? 100 : progress;
    try {
      await patchGoal(goal.id, { status: newStatus, progress: newProgress });
      setStatus(newStatus);
      if (newStatus === GOAL_STATUS.COMPLETED) setProgress(100);
    } catch {
      // state unchanged — user can retry
    } finally {
      setTogglingStatus(false);
    }
  };

  const toggleAbandon = async () => {
    if (abandoningStatus) return;
    setAbandoningStatus(true);
    const newStatus = status === GOAL_STATUS.ABANDONED ? GOAL_STATUS.ACTIVE : GOAL_STATUS.ABANDONED;
    try {
      await patchGoal(goal.id, { status: newStatus });
      setStatus(newStatus);
    } catch {
      // state unchanged — user can retry
    } finally {
      setAbandoningStatus(false);
    }
  };

  const isCompleted = status === GOAL_STATUS.COMPLETED;
  const isAbandoned = status === GOAL_STATUS.ABANDONED;
  const isClosed = isCompleted || isAbandoned;

  return {
    status, progress, setProgress,
    milestones, setMilestones,
    targetDate, setTargetDate,
    togglingStatus, abandoningStatus,
    displayTitle, description,
    addingChild, childTitle, savingChild, childError,
    titleEdit, descEdit,
    isClosed, isCompleted, isAbandoned,
    titleError, descError,
    handleAddChild, commitTitle, commitDesc,
    toggleComplete, toggleAbandon,
    setAddingChild: (v: boolean) => { setAddingChild(v); if (!v) { setChildTitle(""); setChildError(null); } },
    setChildTitle: (v: string) => { setChildTitle(v); setChildError(null); },
  };
}
