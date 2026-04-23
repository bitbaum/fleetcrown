import { Target, Bell, Inbox, AlertCircle, Clock, Calendar, Users } from "lucide-react";
import { getTodaySummary } from "@/db/queries/today";

export async function SummaryBar() {
  const s = await getTodaySummary();

  return (
    <div className="flex flex-wrap gap-3">
      <Pill icon={Target} value={`${s.activeGoals} goals · ${s.avgGoalProgress}%`} />
      {s.goalsDueSoon > 0 && (
        <Pill icon={Clock} value={`${s.goalsDueSoon} goal${s.goalsDueSoon > 1 ? "s" : ""} due soon`} variant="amber" />
      )}
      {s.pendingDrafts > 0 && (
        <Pill icon={Inbox} value={`${s.pendingDrafts} drafts`} variant="amber" />
      )}
      {s.overdueCommitments > 0 && (
        <Pill icon={AlertCircle} value={`${s.overdueCommitments} overdue`} variant="red" />
      )}
      {s.eventsDueSoon > 0 && (
        <Pill icon={Calendar} value={`${s.eventsDueSoon} deadline${s.eventsDueSoon > 1 ? "s" : ""}`} variant="amber" />
      )}
      {s.staleContacts > 0 && (
        <Pill icon={Users} value={`${s.staleContacts} contacts need attention`} variant="amber" />
      )}
      {s.urgentAlerts > 0 && (
        <Pill icon={Bell} value={`${s.urgentAlerts} urgent`} variant="red" />
      )}
    </div>
  );
}

function Pill({
  icon: Icon,
  value,
  variant,
}: {
  icon: typeof Target;
  value: string;
  variant?: "amber" | "red";
}) {
  const colors = variant === "red"
    ? "bg-red-400/10 text-red-400 border-red-400/20"
    : variant === "amber"
      ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
      : "bg-white/5 text-white/60 border-white/10";

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${colors}`}>
      <Icon className="h-3 w-3" />
      <span>{value}</span>
    </div>
  );
}
