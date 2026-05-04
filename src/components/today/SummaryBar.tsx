import { Target, Bell, Inbox, AlertCircle, Clock, Calendar, Users, Repeat2 } from "lucide-react";
import Link from "next/link";
import { getTodaySummary } from "@/db/queries/today";
import { getCurrentUserId } from "@/lib/session";

export async function SummaryBar() {
  const userId = await getCurrentUserId();
  const s = await getTodaySummary(userId);

  return (
    <div className="flex flex-wrap gap-3">
      <Pill icon={Target} value={`${s.activeGoals} goals · ${s.avgGoalProgress}%`} href="/goals" />
      {s.habitsTotal > 0 && (
        <Pill
          icon={Repeat2}
          value={`${s.habitsDone}/${s.habitsTotal} habits`}
          variant={s.habitsDone === s.habitsTotal ? "green" : undefined}
          href="/habits"
        />
      )}
      {s.goalsDueSoon > 0 && (
        <Pill icon={Clock} value={`${s.goalsDueSoon} goal${s.goalsDueSoon > 1 ? "s" : ""} due soon`} variant="amber" href="/goals" />
      )}
      {s.pendingDrafts > 0 && (
        <Pill icon={Inbox} value={`${s.pendingDrafts} drafts`} variant="amber" href="/today" />
      )}
      {s.overdueCommitments > 0 && (
        <Pill icon={AlertCircle} value={`${s.overdueCommitments} overdue`} variant="red" href="/today" />
      )}
      {s.eventsDueSoon > 0 && (
        <Pill icon={Calendar} value={`${s.eventsDueSoon} deadline${s.eventsDueSoon > 1 ? "s" : ""}`} variant="amber" href="/events" />
      )}
      {s.staleContacts > 0 && (
        <Pill
          icon={Users}
          value={`${s.staleContacts} contacts need attention`}
          variant="amber"
          href="/people?health=fading%2Cstale"
        />
      )}
      {s.urgentAlerts > 0 && (
        <Pill icon={Bell} value={`${s.urgentAlerts} urgent`} variant="red" href="/system" />
      )}
    </div>
  );
}

function Pill({
  icon: Icon,
  value,
  variant,
  href,
}: {
  icon: typeof Target;
  value: string;
  variant?: "amber" | "red" | "green";
  href?: string;
}) {
  const colors = variant === "red"
    ? "border-status-negative/20 bg-status-negative-subtle text-status-negative"
    : variant === "amber"
      ? "border-status-warning/20 bg-status-warning-subtle text-status-warning"
      : variant === "green"
        ? "border-status-positive/20 bg-status-positive-subtle text-status-positive"
        : "border-border-default bg-surface-base text-text-secondary";

  const inner = (
    <>
      <Icon className="h-3 w-3" />
      <span>{value}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 ${colors}`}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${colors}`}>
      {inner}
    </div>
  );
}
