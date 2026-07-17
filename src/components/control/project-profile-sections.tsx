"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentPrompt } from "@/app/api/prompts/agent/route";
import type { ProjectState } from "@/lib/control-types";

export function CollapsibleSection({
  title,
  icon,
  badge,
  trailing,
  contentClassName,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-raised/40 sm:px-5"
      >
        <span className="flex items-center gap-2.5">
          {icon}
          <span className="text-sm font-medium text-text-secondary">{title}</span>
          {badge}
        </span>
        <span className="flex items-center gap-2">
          {trailing}
          <ChevronRight className={cn("h-3.5 w-3.5 text-text-muted transition-transform duration-150", open && "rotate-90")} />
        </span>
      </button>
      {open && (
        <div className={cn("px-4 pb-4 pt-1 sm:px-5", contentClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}

export const DIMENSION_META: Record<string, { label: string; icon: string }> = {
  engineering: { label: "Engineering",  icon: "⚙" },
  product:     { label: "Product",      icon: "📦" },
  ux:          { label: "UX / Design",  icon: "🎨" },
  marketing:   { label: "Marketing",    icon: "📣" },
  content:     { label: "Content",      icon: "✍" },
  business:    { label: "Business",     icon: "💼" },
  deploy:      { label: "Deploy",       icon: "🚀" },
};

export function interpolate(
  template: string,
  ctx: { name: string; path: string; mission?: string; stack?: string; url?: string },
): string {
  return template
    .replace(/\{name\}/g, ctx.name)
    .replace(/\{path\}/g, ctx.path)
    .replace(/\{mission\}/g, ctx.mission ?? "not specified")
    .replace(/\{stack\}/g, ctx.stack ?? "not specified")
    .replace(/\{url\}/g, ctx.url ?? "not deployed yet");
}

export function DimensionSection({
  dimensionId,
  prompts,
  project,
  usageCounts,
  isSending,
  onFill,
  onRun,
}: {
  dimensionId: string;
  prompts: AgentPrompt[];
  project: ProjectState;
  usageCounts: Map<string, number>;
  isSending: boolean;
  /** Default click behavior — drops the interpolated template into the
   *  composer textarea so the user can preview/edit before sending.
   *  Universal "fill-first" rule shipped 2026-05-31; replaces the previous
   *  onRun-only behavior that silently dispatched without preview. */
  onFill: (prompt: string) => void;
  /** Optional send-immediate for prompts flagged sendNow:true in the SSOT
   *  (e.g. hard_stop kill switch — preview makes no sense). Rendered as a
   *  small ↪ icon button next to the main fill action so the bypass is
   *  visible in the UI, not hidden in code. */
  onRun?: (prompt: string) => void;
}) {
  const meta = DIMENSION_META[dimensionId];
  if (!meta || prompts.length === 0) return null;

  const ctx = {
    name: project.tab,
    path: project.dir,
    mission: project.profile?.mission,
    stack: project.profile?.stack,
    url: project.profile?.url,
  };

  return (
    <CollapsibleSection
      title={meta.label}
      icon={<span className="text-base leading-none">{meta.icon}</span>}
      contentClassName="flex flex-wrap gap-2"
    >
      {prompts.map((p) => {
        const rendered = interpolate(p.prompt, ctx);
        const uses = usageCounts.get(rendered) ?? 0;
        const sendNow = p.sendNow === true;
        return (
          <div key={p.key} className="inline-flex items-stretch rounded-xl border border-border-subtle bg-surface-base text-xs font-medium text-text-secondary transition-all hover:border-accent-primary/40 hover:text-text-primary">
            <button
              onClick={() => onFill(rendered)}
              disabled={isSending}
              title={sendNow ? `Fill composer — also click ↪ to send immediately` : `Fill composer with this prompt`}
              className="min-h-10 rounded-l-xl px-3.5 py-2 hover:bg-surface-raised disabled:opacity-40"
            >
              {p.icon} {p.label}
              {uses > 0 && <span className="ml-2 text-micro text-text-tertiary">×{uses}</span>}
            </button>
            {sendNow && onRun && (
              <button
                onClick={() => onRun(rendered)}
                disabled={isSending}
                title="Send now without preview"
                aria-label={`Send "${p.label}" immediately`}
                className="min-h-10 rounded-r-xl border-l border-border-subtle px-2.5 py-2 text-text-tertiary hover:bg-status-warning-subtle hover:text-status-warning disabled:opacity-40"
              >
                ↪
              </button>
            )}
          </div>
        );
      })}
    </CollapsibleSection>
  );
}
