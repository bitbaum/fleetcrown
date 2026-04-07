import { Target, Bell, Inbox, AlertCircle } from "lucide-react";
import { getTodaySummary } from "@/db/queries/today";

export async function SummaryBar() {
  const s = await getTodaySummary();

  return (
    <div className="flex flex-wrap gap-4 text-xs text-white/50">
      <Stat icon={Target} label="Goals" value={`${s.activeGoals} active · ${s.avgGoalProgress}% avg`} />
      {s.pendingDrafts > 0 && (
        <Stat icon={Inbox} label="Drafts" value={`${s.pendingDrafts} pending`} highlight />
      )}
      {s.overdueCommitments > 0 && (
        <Stat icon={AlertCircle} label="Overdue" value={`${s.overdueCommitments}`} danger />
      )}
      {s.urgentAlerts > 0 && (
        <Stat icon={Bell} label="Urgent" value={`${s.urgentAlerts}`} danger />
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  highlight,
  danger,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${danger ? "text-red-400/70" : highlight ? "text-amber-400/70" : ""}`}>
      <Icon className="h-3 w-3" />
      <span className="font-medium">{label}:</span>
      <span>{value}</span>
    </div>
  );
}
