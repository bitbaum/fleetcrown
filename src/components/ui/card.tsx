import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      className={cn(
        "ui-panel p-5 md:p-6 text-left",
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
    <div className="mb-4 flex items-center gap-2.5">
      <Icon className="h-4 w-4 md:h-5 md:w-5 text-text-tertiary" />
      <h3 className="text-base font-medium text-text-primary">{title}</h3>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="ui-panel animate-pulse p-5 md:p-6">
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
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <div className="ui-kicker">{label}</div>
      <div className="mt-2 text-2xl md:text-3xl font-medium text-text-primary">{value}</div>
      <div className="mt-1 text-sm text-text-secondary">{sub}</div>
    </Card>
  );
}
