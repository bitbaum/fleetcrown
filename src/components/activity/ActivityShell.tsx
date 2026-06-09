import Link from "next/link";
import { Clock, FileText, ScrollText } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { cn } from "@/lib/utils";

type ActivityTabId = "digests" | "history" | "decisions";

const ACTIVITY_TABS: Array<{
  id: ActivityTabId;
  label: string;
  href: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    id: "digests",
    label: "Digests",
    href: "/activity",
    description: "Readable progress summaries by hour, day, week, or month.",
    icon: FileText,
  },
  {
    id: "history",
    label: "History",
    href: "/history",
    description: "Raw prompt dispatch log, newest first.",
    icon: Clock,
  },
  {
    id: "decisions",
    label: "Decisions",
    href: "/decisions",
    description: "Audit timeline of fleet events and choices.",
    icon: ScrollText,
  },
];

export function ActivityShell({
  active,
  children,
  right,
  maxWidth = "max-w-5xl",
}: {
  active: ActivityTabId;
  children: React.ReactNode;
  right?: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <PageLayout
      title="Activity"
      subtitle="One place for progress summaries, raw dispatch history, and auditable decisions. Digests are the readable view; History and Decisions keep the source trail."
      right={right}
      maxWidth={maxWidth}
    >
      <div className="space-y-5">
        <nav
          aria-label="Activity views"
          className="flex flex-col gap-2 border-b border-border-subtle sm:flex-row"
        >
          {ACTIVITY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "ui-tab min-h-11 sm:min-h-0 sm:px-4",
                  isActive && "ui-tab-active",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="grid gap-2 sm:grid-cols-3">
          {ACTIVITY_TABS.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs leading-relaxed",
                active === tab.id
                  ? "border-accent-primary/25 bg-accent-muted text-text-secondary"
                  : "border-border-subtle bg-surface-overlay text-text-tertiary",
              )}
            >
              <span className="font-medium text-text-primary">{tab.label}:</span>{" "}
              {tab.description}
            </div>
          ))}
        </div>

        {children}
      </div>
    </PageLayout>
  );
}
