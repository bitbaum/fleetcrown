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
        "rounded-lg border border-white/10 bg-white/[0.03] p-4 text-left",
        onClick && "cursor-pointer hover:bg-white/[0.06] transition-colors",
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
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-white/50" />
      <h3 className="text-sm font-medium text-white/70">{title}</h3>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 animate-pulse">
      <div className="h-4 bg-white/10 rounded w-24 mb-3" />
      <div className="space-y-2">
        <div className="h-3 bg-white/5 rounded w-full" />
        <div className="h-3 bg-white/5 rounded w-3/4" />
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
      <div className="text-xs text-white/40 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
      <div className="text-xs text-white/30 mt-0.5">{sub}</div>
    </Card>
  );
}
