"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import type { GoalWithChildren } from "@/db/queries/goals";

export function NewGoalButton({ goals }: { goals: GoalWithChildren[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [parentGoalId, setParentGoalId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setTargetDate("");
    setParentGoalId("");
    setError(null);
  };

  const close = () => { reset(); setOpen(false); };

  const handleCreate = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          targetDate: targetDate || undefined,
          parentGoalId: parentGoalId || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error ?? "Failed to create goal"); return; }
      close();
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // Flatten goal tree for parent selector
  const flatGoals: Array<{ id: string; title: string; depth: number }> = [];
  function flatten(list: GoalWithChildren[], depth: number) {
    for (const g of list) {
      if (g.status !== "completed") {
        flatGoals.push({ id: g.id, title: g.title, depth });
        flatten(g.children, depth + 1);
      }
    }
  }
  flatten(goals, 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Goal
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
          <div className="relative w-full max-w-md bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">New Goal</div>
              <button onClick={close} className="p-1 text-white/40 hover:text-white/70 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleCreate(); if (e.key === "Escape") close(); }}
                  placeholder="What are you working toward?"
                  autoFocus
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional context or motivation"
                  rows={2}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>

                {flatGoals.length > 0 && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
                      Parent Goal
                    </label>
                    <select
                      value={parentGoalId}
                      onChange={(e) => setParentGoalId(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25 transition-colors"
                    >
                      <option value="">— None —</option>
                      {flatGoals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {"  ".repeat(g.depth)}{g.depth > 0 ? "↳ " : ""}{g.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={saving || !title.trim()}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
              ) : (
                <><Plus className="h-4 w-4" /> Create Goal</>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
