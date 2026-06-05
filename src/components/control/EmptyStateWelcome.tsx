"use client";

import Link from "next/link";
import { GitBranch, Plus, Monitor, Terminal, Sparkles } from "lucide-react";

/**
 * Empty-state welcome shown when a new user lands on /control with zero
 * registered projects. Replaces the dead-end blank fleet status that made
 * the captain-mode pitch fall apart at first contact.
 *
 * Five paths offered, in priority order:
 *   1. Start a new idea — Bootstrap (AI brief → GitHub repo → local folder → DB)
 *   2. Import from GitHub — multi-select existing repos
 *   3. Import from ~/dev — terminal one-liner for local git repos
 *   4. Add a project — manual one-off entry
 *   5. Install Fleet Runner — local detection desktop app
 *
 * `onBootstrap` and `onAddManual` are bound to the two modals owned by
 * ControlPanel (the only meaningful caller). If `onBootstrap` is omitted
 * (e.g., daemon unavailable), the bootstrap card is hidden — Bootstrap
 * requires local runtime today.
 */
export function EmptyStateWelcome({
  onAddManual,
  onBootstrap,
}: {
  onAddManual: () => void;
  onBootstrap?: () => void;
}) {
  return (
    <section className="ui-card-shell-raised p-6 md:p-8">
      <div className="space-y-2 mb-6">
        <h2 className="ui-page-title">Welcome to your fleet 🚀</h2>
        <p className="ui-page-subtitle">
          You don&apos;t have any projects yet. Pick how you want to add the first one:
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        {/* TOP CTA: scaffold a brand-new project from an idea. Two modes:
            - With local runtime: opens BootstrapModal (AI brief → GitHub repo
              → local folder → agent launched).
            - Cloud only: links to /control/new-from-scratch which creates a
              GitHub repo + FleetCrown row, and tells the user to `git clone`. */}
        {onBootstrap ? (
          <button
            type="button"
            onClick={onBootstrap}
            className="ui-card-shell hover:border-accent transition-colors p-4 flex flex-col gap-2 group text-left"
          >
            <Sparkles className="h-5 w-5 text-accent" />
            <div>
              <div className="font-medium text-text-primary">Start a new idea</div>
              <div className="text-sm text-text-muted mt-1">
                Describe it once. AI fills in the brief, creates the GitHub repo + local folder, launches the agent.
              </div>
            </div>
            <div className="text-xs text-accent mt-auto pt-2 group-hover:underline">
              Bootstrap →
            </div>
          </button>
        ) : (
          <Link
            href="/control/new-from-scratch"
            className="ui-card-shell hover:border-accent transition-colors p-4 flex flex-col gap-2 group"
          >
            <Sparkles className="h-5 w-5 text-accent" />
            <div>
              <div className="font-medium text-text-primary">Start a new project</div>
              <div className="text-sm text-text-muted mt-1">
                Type a name. We create the GitHub repo + project record. You{" "}
                <code className="px-1 rounded bg-surface-base text-xs">git clone</code> it when you&apos;re ready.
              </div>
            </div>
            <div className="text-xs text-accent mt-auto pt-2 group-hover:underline">
              Recommended →
            </div>
          </Link>
        )}

        {/* Primary CTA when daemon offline (and secondary otherwise): import from GitHub. */}
        <Link
          href="/control/import"
          className="ui-card-shell hover:border-accent transition-colors p-4 flex flex-col gap-2 group"
        >
          <GitBranch className="h-5 w-5 text-accent" />
          <div>
            <div className="font-medium text-text-primary">Import from GitHub</div>
            <div className="text-sm text-text-muted mt-1">
              Pick repos to manage as projects. Multi-select.
            </div>
          </div>
          <div className="text-xs text-accent mt-auto pt-2 group-hover:underline">
            Recommended →
          </div>
        </Link>

        {/* Secondary CTA: import from local ~/dev folder via terminal one-liner. */}
        <Link
          href="/control/import-local"
          className="ui-card-shell hover:border-accent transition-colors p-4 flex flex-col gap-2 group"
        >
          <Terminal className="h-5 w-5 text-accent" />
          <div>
            <div className="font-medium text-text-primary">Import from ~/dev</div>
            <div className="text-sm text-text-muted mt-1">
              Paste one terminal line. Scans ~/dev for git repos, imports them all.
            </div>
          </div>
          <div className="text-xs text-accent mt-auto pt-2 group-hover:underline">
            One-liner →
          </div>
        </Link>

        {/* Secondary: add one manually. For non-GitHub users or one-offs. */}
        <button
          type="button"
          onClick={onAddManual}
          className="ui-card-shell hover:border-accent transition-colors p-4 flex flex-col gap-2 text-left group"
        >
          <Plus className="h-5 w-5 text-text-secondary" />
          <div>
            <div className="font-medium text-text-primary">Add a project</div>
            <div className="text-sm text-text-muted mt-1">
              Type a name and description. One-off, no GitHub needed.
            </div>
          </div>
          <div className="text-xs text-text-secondary mt-auto pt-2 group-hover:underline">
            Add manually →
          </div>
        </button>

        {/* Tertiary: install desktop for local dev folder detection. */}
        <Link
          href="/download"
          className="ui-card-shell hover:border-accent transition-colors p-4 flex flex-col gap-2 group"
        >
          <Monitor className="h-5 w-5 text-text-secondary" />
          <div>
            <div className="font-medium text-text-primary">Install Fleet Runner</div>
            <div className="text-sm text-text-muted mt-1">
              Desktop app — detect ~/dev folders and dispatch agents.
            </div>
          </div>
          <div className="text-xs text-text-secondary mt-auto pt-2 group-hover:underline">
            Download →
          </div>
        </Link>
      </div>

      <p className="text-xs text-text-tertiary mt-6">
        You can add more projects any time from the toolbar above the project list.
      </p>
    </section>
  );
}
