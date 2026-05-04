import type { LucideIcon } from "lucide-react";

export function PlaceholderView({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-text-muted gap-4">
      <Icon className="h-16 w-16" />
      <div className="text-xl font-semibold">{title}</div>
      <div className="text-sm">Coming in Phase 2</div>
    </div>
  );
}
