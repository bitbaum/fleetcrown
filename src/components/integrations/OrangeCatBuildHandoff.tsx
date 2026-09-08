"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Bot, ExternalLink } from "lucide-react";
import type { OrangeCatBuildIntent } from "@/lib/integrations/orangecat-build-intent";

interface ProjectOption {
  id: string;
  name: string;
  repoUrl: string | null;
  dirPath: string | null;
  liveUrl: string | null;
  /** Already the origin of a different OrangeCat entity — relinking repoints it. */
  linkedTo: { title: string | null; publicUrl: string } | null;
  /** Already linked to this same entity — confirming changes nothing. */
  alreadyLinked: boolean;
}

export function OrangeCatBuildHandoff({
  token,
  intent,
  projects,
}: {
  token: string;
  intent: OrangeCatBuildIntent;
  projects: ProjectOption[];
}) {
  // If a project with the exact same name already exists, default to linking
  // it instead of "new" — the whole point of offering a picker is defeated if
  // the obvious match still requires the user to notice and switch the radio
  // themselves. "Bitbaum" on OrangeCat and "Bitbaum" on FleetCrown are almost
  // certainly the same thing; proposing a second "Bitbaum" project by default
  // is exactly the duplicate this picker exists to prevent.
  const exactMatch = projects.find(
    (project) => project.name.trim().toLowerCase() === intent.entity.title.trim().toLowerCase(),
  );
  const [mode, setMode] = useState<"new" | "existing">(exactMatch ? "existing" : "new");
  const [projectId, setProjectId] = useState(exactMatch?.id ?? projects[0]?.id ?? "");
  const [replaceOrigin, setReplaceOrigin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selected = projects.find((project) => project.id === projectId) ?? null;
  // Only blocks when the chosen project is the origin of a *different* entity;
  // the server enforces the same rule, so a stale page cannot slip past it.
  const needsReplaceAck = mode === "existing" && Boolean(selected?.linkedTo) && !replaceOrigin;

  async function confirm() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/orangecat/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          projectId: mode === "existing" ? projectId : null,
          replaceExistingOrigin: mode === "existing" && replaceOrigin,
        }),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Could not create project.");
      window.location.assign(body.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create project.");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-2xl border border-border-subtle bg-surface-base p-6">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-accent-text" aria-hidden />
          <span className="ui-public-eyebrow">OrangeCat → FleetCrown</span>
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-text-primary">{intent.entity.title}</h1>
        {intent.entity.description && (
          <p className="mt-4 whitespace-pre-wrap text-text-secondary">
            {intent.entity.description}
          </p>
        )}
        <a
          href={intent.entity.publicUrl}
          target="_blank"
          rel="noreferrer"
          className="ui-public-link mt-5 inline-flex items-center gap-1.5"
        >
          View the OrangeCat page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>

        <div className="mt-8 border-t border-border-subtle pt-6">
          <h2 className="font-medium text-text-primary">Loki’s proposed starting plan</h2>
          <ol className="mt-4 space-y-3">
            {intent.suggestedHandoff.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-relaxed text-text-secondary">
                <span className="font-mono text-text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-xs text-text-muted">
            This creates context and a proposed plan. It does not dispatch agents or make real-world
            commitments.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border-subtle bg-surface-base p-6">
        <h2 className="text-lg font-semibold text-text-primary">Where should this live?</h2>
        <p className="mt-2 text-sm text-text-secondary">
          In a FleetCrown project — a workspace record, not a repository. A project may point at a
          repo, a local checkout and a live site, and each option below shows which of those it
          actually has.
        </p>
        <div className="mt-5 space-y-3">
          <label className="flex cursor-pointer gap-3 rounded-xl border border-border-subtle p-4">
            <input
              type="radio"
              checked={mode === "new"}
              onChange={() => setMode("new")}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-text-primary">Create a new project</span>
              <span className="mt-1 block text-sm text-text-secondary">
                Prefill the title, brief, OrangeCat origin, and Loki plan. No repo or local path is
                attached — you set those later in Control.
              </span>
            </span>
          </label>
          {projects.length > 0 && (
            <label className="flex cursor-pointer gap-3 rounded-xl border border-border-subtle p-4">
              <input
                type="radio"
                checked={mode === "existing"}
                onChange={() => setMode("existing")}
                className="mt-1"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-text-primary">
                  Link an existing project
                  {exactMatch && (
                    <span className="ml-2 font-normal text-text-muted">
                      — “{exactMatch.name}” already exists
                    </span>
                  )}
                </span>
                <select
                  value={projectId}
                  onChange={(event) => {
                    setProjectId(event.target.value);
                    setReplaceOrigin(false);
                  }}
                  disabled={mode !== "existing"}
                  className="ui-input mt-3 w-full"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.linkedTo ? " — linked elsewhere" : ""}
                    </option>
                  ))}
                </select>
                {mode === "existing" && selected && <ProjectProvenance project={selected} />}
              </span>
            </label>
          )}
        </div>
        {mode === "existing" && selected?.linkedTo && (
          <label className="ui-callout-warning mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={replaceOrigin}
              onChange={(event) => setReplaceOrigin(event.target.checked)}
              className="mt-1"
            />
            <span className="text-text-secondary">
              <span className="flex items-center gap-1.5 font-medium text-text-primary">
                <AlertTriangle className="h-4 w-4" aria-hidden />“{selected.name}” already points at{" "}
                {selected.linkedTo.title ?? "another OrangeCat entity"}
              </span>
              <span className="mt-1 block">
                Confirming repoints its OrangeCat origin — and the funding it reads — at{" "}
                {intent.entity.title}. Tick to replace it.
              </span>
            </span>
          </label>
        )}
        {mode === "existing" && selected?.alreadyLinked && (
          <p className="mt-4 text-sm text-text-secondary">
            “{selected.name}” is already linked to {intent.entity.title}. Confirming just opens it.
          </p>
        )}
        <button
          type="button"
          onClick={confirm}
          disabled={submitting || (mode === "existing" && (!projectId || needsReplaceAck))}
          className="ui-btn-primary mt-6 w-full min-h-11 gap-2"
        >
          {submitting ? "Linking…" : "Confirm and open project"}
          {!submitting && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
        {error && <p className="mt-3 text-sm text-status-negative">{error}</p>}
        <p className="mt-4 text-xs text-text-muted">
          This signed handoff expires after ten minutes and can be used once.
        </p>
      </section>
    </div>
  );
}

/**
 * What the selected project actually is. Without this the picker is a list of
 * bare names that read like repositories — the reader cannot tell a repo-backed
 * project from a cloud-only record, which is the question the picker provokes.
 */
function ProjectProvenance({ project }: { project: ProjectOption }) {
  const facts: { label: string; value: string }[] = [];
  if (project.repoUrl) facts.push({ label: "Repo", value: project.repoUrl });
  if (project.dirPath) facts.push({ label: "Local", value: project.dirPath });
  if (project.liveUrl) facts.push({ label: "Site", value: project.liveUrl });

  if (facts.length === 0) {
    return (
      <span className="mt-3 block text-xs text-text-muted">
        No repo, no local checkout, no live site — a FleetCrown record only.
      </span>
    );
  }

  return (
    <dl className="mt-3 space-y-1 text-xs text-text-muted">
      {facts.map((fact) => (
        <div key={fact.label} className="flex gap-2">
          <dt className="w-12 shrink-0">{fact.label}</dt>
          <dd className="min-w-0 truncate font-mono">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
