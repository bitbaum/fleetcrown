import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

/**
 * Empty-state slot used inside Cards / Sections.
 *
 * Bare children renders the dim one-liner ("no items yet"). When any of
 * icon / title / action is provided, switches to the block variant
 * (icon + title + helper + CTA) sized by the `size` prop.
 *
 *   <EmptyState>No habits tracked yet</EmptyState>
 *   <EmptyState icon={Target} title="No goals yet" action={<NewGoalButton />}>
 *     Goals connect your projects, commitments, and people to what matters.
 *   </EmptyState>
 */
export function EmptyState({
  icon: Icon,
  title,
  action,
  size = "md",
  className,
  children,
}: {
  icon?: LucideIcon;
  title?: string;
  action?: React.ReactNode;
  size?: Size;
  className?: string;
  children?: React.ReactNode;
}) {
  if (!Icon && !title && !action) {
    return <div className={cn("text-sm text-text-tertiary", className)}>{children}</div>;
  }
  const pad = size === "sm" ? "ui-empty-block-sm" : size === "lg" ? "ui-empty-block-lg" : "ui-empty-block-md";
  return (
    <div className={cn("ui-empty-block", pad, className)}>
      {Icon && <Icon className="ui-empty-icon" />}
      {title && <div className="ui-empty-title">{title}</div>}
      {children && <div className="ui-empty-helper">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
