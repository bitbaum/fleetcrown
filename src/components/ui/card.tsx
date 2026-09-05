import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  id,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      id={id}
      className={cn(
        "ui-card-shell ui-card-padding text-left",
        onClick && "ui-panel-interactive cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </Comp>
  );
}

export function CardHeader({
  icon: Icon,
  title,
  right,
}: {
  icon: LucideIcon;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="ui-card-header">
      <div className="ui-card-header-main flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-text-tertiary md:h-5 md:w-5" />
        <h3 className="min-w-0 text-base font-medium text-text-primary">{title}</h3>
      </div>
      {right && <div className="sm:ml-auto">{right}</div>}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="ui-card-shell animate-pulse p-4 sm:p-5 md:p-6">
      <div className="h-4 bg-border-default rounded w-24 mb-3" />
      <div className="space-y-2">
        <div className="h-3 bg-border-subtle rounded w-full" />
        <div className="h-3 bg-border-subtle rounded w-3/4" />
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  /**
   * ReactNode, not string: a figure that is really SEVERAL figures (a burn in
   * two currencies) has to stack, and joining it into one string wrapped
   * mid-number at 390px. Every existing caller passes a string and is
   * unaffected.
   */
  value: React.ReactNode;
  sub: string;
}) {
  // Not built on <Card>: below `sm` this is a chip on one scrollable line, and
  // Card hard-codes the padding and radius that shape would have to fight. The
  // responsive behaviour lives in `.ui-stat-card` — globals.css carries the
  // measurement for why three tall cards were the wrong thing on a phone.
  return (
    <div className="ui-stat-card">
      <div className="ui-stat-card-label">{label}</div>
      <div className="ui-stat-card-value">{value}</div>
      <div className="ui-stat-card-sub">{sub}</div>
    </div>
  );
}
