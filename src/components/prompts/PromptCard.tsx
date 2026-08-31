"use client";

// Unified prompt card — the single card format for FleetCrown default prompts.
// Replaces the old FeaturedCard (Quick Access grid) + PromptRow (category rows)
// split: one library, one card, rendered in one responsive grid. Featured
// prompts are marked with a star and sorted first rather than duplicated into a
// separate section.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  Clock,
  Globe,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  Loader2,
  Star,
} from "lucide-react";
import { usePromptModals } from "./use-prompt-modals";
import { useForkPrompt } from "./use-fork-prompt";
import { CATEGORY_META, type PromptTemplate } from "@/config/prompt-library";
import type { Project } from "./types";
import { haptic } from "@/lib/haptics";

export function PromptCard({
  template,
  projects,
}: {
  template: PromptTemplate;
  projects: Project[];
}) {
  const { openRun, openSchedule, modals } = usePromptModals(template, projects);
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { fork, state } = useForkPrompt(template, () => startTransition(() => router.refresh()));
  const meta = CATEGORY_META[template.category];

  return (
    <>
      <div className="ui-card-shell-raised ui-panel-interactive group flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className={`ui-chip ${meta.color}`}>{meta.label}</span>
          {template.featured && (
            <Star
              className="h-3.5 w-3.5 fill-status-warning/80 text-status-warning/80"
              aria-label="Featured"
            />
          )}
          {template.scope === "global" ? (
            <span className="ui-badge">
              <Globe className="h-3 w-3" /> global
            </span>
          ) : (
            <span className="ui-badge">
              <FolderOpen className="h-3 w-3" /> project
            </span>
          )}
          {template.suggestedSchedule && (
            <span className="ui-badge">
              <Clock className="h-3 w-3" /> schedulable
            </span>
          )}
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-semibold leading-snug text-text-primary">{template.name}</h3>
          <p className="mt-1 text-base leading-relaxed text-text-secondary">
            {template.description}
          </p>
        </div>

        <div className="mt-auto flex items-center gap-2">
          <button
            onClick={() => {
              haptic();
              openRun();
            }}
            className="ui-btn-lg flex flex-1 items-center justify-center gap-2"
          >
            <Zap className="h-4 w-4" /> Run
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="ui-btn-overlay p-3"
            title="Preview prompt"
            aria-label="Preview prompt"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={fork}
            disabled={state === "forking" || isPending}
            className="ui-btn-overlay p-3 disabled:opacity-40"
            title="Fork into your own prompts"
            aria-label="Fork prompt"
          >
            {state === "forking" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : state === "done" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          {template.suggestedSchedule && (
            <button
              onClick={openSchedule}
              className="ui-btn-overlay p-3"
              title="Schedule as cron job"
              aria-label="Schedule prompt"
            >
              <Clock className="h-4 w-4" />
            </button>
          )}
        </div>

        {expanded && <pre className="ui-code-surface">{template.template}</pre>}
      </div>

      {modals}
    </>
  );
}
