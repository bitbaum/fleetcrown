"use client";

import { useState } from "react";
import { Plus, Trash2, ExternalLink, X } from "lucide-react";
import type { GuideStep, SiteGuide } from "@/db/schema";

type DraftStep = { label: string; path: string; note: string };

const EMPTY_STEP: DraftStep = { label: "", path: "", note: "" };

function stepUrl(liveUrl: string | null, path: string | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (!liveUrl) return null;
  try {
    return new URL(path, liveUrl).toString();
  } catch {
    return null;
  }
}

export function SiteGuides({
  projectId,
  liveUrl,
  initialGuides,
}: {
  projectId: string;
  liveUrl: string | null;
  initialGuides: SiteGuide[];
}) {
  const [guides, setGuides] = useState<SiteGuide[]>(initialGuides);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([{ ...EMPTY_STEP }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setTitle("");
    setDescription("");
    setSteps([{ ...EMPTY_STEP }]);
    setCreating(false);
    setError(null);
  }

  async function save() {
    // A guide with no titled step is a title with no content — reject it here
    // rather than storing an empty shell that reads as a broken guide later.
    const cleaned: GuideStep[] = steps
      .filter((s) => s.label.trim())
      .map((s) => ({
        label: s.label.trim(),
        ...(s.path.trim() ? { path: s.path.trim() } : {}),
        ...(s.note.trim() ? { note: s.note.trim() } : {}),
      }));
    if (!title.trim()) {
      setError("Give the guide a title.");
      return;
    }
    if (cleaned.length === 0) {
      setError("Add at least one step.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/atlas/guides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          description: description.trim() || undefined,
          steps: cleaned,
        }),
      });
      const json = (await res.json()) as { guide?: SiteGuide; error?: string };
      if (!res.ok || !json.guide) throw new Error(json.error ?? "Could not save");
      setGuides((prev) => [...prev, json.guide!]);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(guideId: string) {
    setGuides((prev) => prev.filter((g) => g.id !== guideId));
    await fetch(`/api/atlas/guides?guideId=${encodeURIComponent(guideId)}`, { method: "DELETE" });
  }

  return (
    <section
      aria-labelledby="site-guides-title"
      className="rounded-2xl border border-border-subtle bg-surface-raised p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="site-guides-title" className="text-base font-semibold text-text-primary">
          Guides
        </h2>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-default bg-surface-raised px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-overlay"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New guide
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        The page list says where you can go. A guide says which pages, in what order, and what to do
        when you get there.
      </p>

      {creating && (
        <div className="mt-4 space-y-3 rounded-xl border border-border-default bg-surface-overlay p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="How to publish a project"
            aria-label="Guide title"
            autoFocus
            className="w-full rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — when you would use this"
            aria-label="Guide description"
            className="w-full rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary"
          />

          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-xs text-text-tertiary">{i + 1}.</span>
                <div className="flex-1 space-y-1.5">
                  <input
                    value={step.label}
                    onChange={(e) =>
                      setSteps((prev) =>
                        prev.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)),
                      )
                    }
                    placeholder="What you do here"
                    aria-label={`Step ${i + 1} label`}
                    className="w-full rounded-lg border border-border-default bg-surface-raised px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary"
                  />
                  <div className="flex gap-1.5">
                    <input
                      value={step.path}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s, j) => (j === i ? { ...s, path: e.target.value } : s)),
                        )
                      }
                      placeholder="/path (optional)"
                      aria-label={`Step ${i + 1} path`}
                      className="w-1/3 rounded-lg border border-border-default bg-surface-raised px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary"
                    />
                    <input
                      value={step.note}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s, j) => (j === i ? { ...s, note: e.target.value } : s)),
                        )
                      }
                      placeholder="Note — the button to press, the gotcha (optional)"
                      aria-label={`Step ${i + 1} note`}
                      className="flex-1 rounded-lg border border-border-default bg-surface-raised px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary"
                    />
                  </div>
                </div>
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    className="mt-1.5 rounded-lg p-1 text-text-tertiary hover:bg-surface-raised"
                    aria-label={`Remove step ${i + 1}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={() => setSteps((prev) => [...prev, { ...EMPTY_STEP }])}
            className="text-sm text-accent-primary hover:underline"
          >
            + Add step
          </button>

          {error && <p className="text-xs text-status-negative">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="rounded-xl bg-accent-primary px-3 py-1.5 text-sm font-medium text-text-inverted disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save guide"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-text-tertiary hover:text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {guides.length === 0 && !creating ? (
        <p className="mt-4 text-sm text-text-tertiary">
          No guides yet. Write one the next time you work out how to do something here.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {guides.map((guide) => (
            <li key={guide.id} className="rounded-xl border border-border-subtle p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary">{guide.title}</h3>
                  {guide.description && (
                    <p className="mt-0.5 text-sm text-text-secondary">{guide.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void remove(guide.id)}
                  className="shrink-0 rounded-lg p-1.5 text-text-tertiary hover:bg-surface-overlay hover:text-status-negative"
                  aria-label={`Delete guide ${guide.title}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <ol className="mt-3 space-y-2">
                {guide.steps.map((step, i) => {
                  const url = stepUrl(liveUrl, step.path);
                  return (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-xs text-text-tertiary">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-medium text-accent-primary hover:underline"
                          >
                            {step.label}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        ) : (
                          <span className="font-medium text-text-primary">{step.label}</span>
                        )}
                        {step.note && <p className="text-text-secondary">{step.note}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
