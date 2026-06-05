"use client";

import Link from "next/link";
import { GitBranch, Plus, Monitor, Terminal, Sparkles } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

// Empty-state welcome for /control when the user has zero projects.
// The two proactive suggesters (GitHubRepoSuggestions, LocalDevSuggestions)
// render above this when their respective signals exist — this card grid
// remains the fallback for users without either signal.

type WelcomeCardProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: ReactNode;
  cta: string;
  variant?: "primary" | "secondary";
} & (
  | { href: string; onClick?: never }
  | { onClick: () => void; href?: never }
);

function WelcomeCard({ icon: Icon, title, body, cta, variant = "primary", ...rest }: WelcomeCardProps) {
  const iconClass = variant === "primary" ? "text-accent" : "text-text-secondary";
  const ctaClass = variant === "primary" ? "text-accent" : "text-text-secondary";
  const shared = "ui-card-shell hover:border-accent transition-colors p-4 flex flex-col gap-2 group text-left";
  const content = (
    <>
      <Icon className={`h-5 w-5 ${iconClass}`} />
      <div>
        <div className="font-medium text-text-primary">{title}</div>
        <div className="text-sm text-text-muted mt-1">{body}</div>
      </div>
      <div className={`text-xs ${ctaClass} mt-auto pt-2 group-hover:underline`}>{cta}</div>
    </>
  );

  return "href" in rest && rest.href ? (
    <Link href={rest.href} className={shared}>{content}</Link>
  ) : (
    <button type="button" onClick={rest.onClick} className={shared}>{content}</button>
  );
}

export function EmptyStateWelcome({
  onAddManual,
  onBootstrap,
}: {
  onAddManual: () => void;
  onBootstrap?: () => void;
}) {
  return (
    <section className="ui-card-shell-raised p-6 md:p-8">
      <div className="space-y-1 mb-5">
        <h2 className="ui-page-title">Start your first project</h2>
        <p className="ui-page-subtitle">Pick a path — every option is one click away from a working fleet.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        {onBootstrap ? (
          <WelcomeCard
            icon={Sparkles}
            title="Start a new idea"
            body="Describe it once. AI writes the brief, creates the repo + folder, launches the agent."
            cta="Bootstrap →"
            onClick={onBootstrap}
          />
        ) : (
          <WelcomeCard
            icon={Sparkles}
            title="Start a new project"
            body={
              <>
                Type a name. We create the GitHub repo + project record. You{" "}
                <code className="px-1 rounded bg-surface-base text-xs">git clone</code> when ready.
              </>
            }
            cta="Recommended →"
            href="/control/new-from-scratch"
          />
        )}

        <WelcomeCard
          icon={GitBranch}
          title="Import from GitHub"
          body="Pick repos to manage. Multi-select."
          cta="Recommended →"
          href="/control/import"
        />

        <WelcomeCard
          icon={Terminal}
          title="Import from ~/dev"
          body="Paste one terminal line. Scans for git repos, imports them all."
          cta="One-liner →"
          href="/control/import-local"
        />

        <WelcomeCard
          icon={Plus}
          title="Add a project"
          body="Type a name. One-off, no GitHub needed."
          cta="Add manually →"
          variant="secondary"
          onClick={onAddManual}
        />

        <WelcomeCard
          icon={Monitor}
          title="Install Fleet Runner"
          body="Desktop app — detect ~/dev folders and dispatch agents."
          cta="Download →"
          variant="secondary"
          href="/download"
        />
      </div>

      <p className="text-xs text-text-tertiary mt-5">
        You can add more projects any time from the toolbar above.
      </p>
    </section>
  );
}
