import { Target, Bell, Inbox, AlertCircle, Clock, Calendar, Users, Repeat2, Bot, Activity, CirclePause } from "lucide-react";
import Link from "next/link";
import { IvyDispatchButton } from "@/components/shared/IvyDispatchButton";
import { getTodaySummary, getFleetSummary } from "@/db/queries/today";
import { requirePageUserId } from "@/lib/session";
import { APP_LOCALE } from "@/lib/constants";

/** Placeholder shown while SummaryBar's DB queries run. */
export function SummaryBarSkeleton() {
  const widths = ["5rem", "7rem", "6rem", "5rem", "5rem"];
  return (
    <div className="flex gap-3 overflow-x-auto ui-scroll-fade-right [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible">
      {widths.map((w, i) => (
        <div
          key={i}
          style={{ width: w }}
          className="h-8 animate-pulse rounded-full border border-border-default bg-surface-raised"
        />
      ))}
    </div>
  );
}

export async function SummaryBar() {
  const userId = await requirePageUserId();
  const [s, fleet] = await Promise.all([getTodaySummary(userId), getFleetSummary(userId)]);

  const todayBriefPrompt = [
    `Daily brief — ${new Date().toLocaleDateString(APP_LOCALE, { weekday: "long", month: "long", day: "numeric" })}`,
    "",
    s.activeGoals > 0 && `Goals: ${s.activeGoals} active, ${s.avgGoalProgress}% average progress`,
    s.habitsTotal > 0 && `Habits: ${s.habitsDone}/${s.habitsTotal} done today`,
    s.goalsDueSoon > 0 && `Goals due soon: ${s.goalsDueSoon}`,
    s.stuckGoals > 0 && `Stalled goals: ${s.stuckGoals}`,
    s.eventsDueSoon > 0 && `Events with upcoming deadlines: ${s.eventsDueSoon}`,
    s.overdueCommitments > 0 && `Overdue commitments: ${s.overdueCommitments}`,
    s.staleContacts > 0 && `Contacts needing attention: ${s.staleContacts}`,
    s.pendingDrafts > 0 && `Pending action drafts: ${s.pendingDrafts}`,
    s.urgentAlerts > 0 && `Urgent alerts: ${s.urgentAlerts}`,
    (fleet.running > 0 || fleet.waiting > 0 || fleet.degraded > 0) &&
      `Agent fleet: ${[fleet.running > 0 && `${fleet.running} running`, fleet.waiting > 0 && `${fleet.waiting} waiting`, fleet.degraded > 0 && `${fleet.degraded} degraded`].filter(Boolean).join(", ")}`,
    "",
    "What should I focus on today? What's the most urgent thing I'm likely to overlook?",
  ].filter(Boolean).join("\n");

  return (
    <div className="flex gap-3 overflow-x-auto ui-scroll-fade-right [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible">
      {s.activeGoals > 0 && (
        <Pill icon={Target} value={`${s.activeGoals} goals · ${s.avgGoalProgress}%`} href="/goals" />
      )}
      {s.habitsTotal > 0 && (
        <Pill
          icon={Repeat2}
          value={`${s.habitsDone}/${s.habitsTotal} habits`}
          variant={s.habitsDone === s.habitsTotal ? "green" : undefined}
          href="#habits"
        />
      )}
      {s.goalsDueSoon > 0 && (
        <Pill icon={Clock} value={`${s.goalsDueSoon} goal${s.goalsDueSoon > 1 ? "s" : ""} due soon`} variant="amber" href="/goals" />
      )}
      {s.stuckGoals > 0 && (
        <Pill icon={CirclePause} value={`${s.stuckGoals} goal${s.stuckGoals > 1 ? "s" : ""} stalled`} variant="amber" href="#stuck-goals" />
      )}
      {s.pendingDrafts > 0 && (
        <Pill icon={Inbox} value={`${s.pendingDrafts} drafts`} variant="amber" href="#actions" />
      )}
      {s.overdueCommitments > 0 && (
        <Pill icon={AlertCircle} value={`${s.overdueCommitments} overdue`} variant="red" href="#commitments" />
      )}
      {s.eventsDueSoon > 0 && (
        <Pill icon={Calendar} value={`${s.eventsDueSoon} deadline${s.eventsDueSoon > 1 ? "s" : ""}`} variant="amber" href="/events" />
      )}
      {s.staleContacts > 0 && (
        <Pill
          icon={Users}
          value={`${s.staleContacts} contacts`}
          variant="amber"
          href="/people?health=stale"
        />
      )}
      {s.urgentAlerts > 0 && (
        <Pill icon={Bell} value={`${s.urgentAlerts} urgent`} variant="red" href="#alerts" />
      )}
      {fleet.degraded > 0 && (
        <Pill icon={Activity} value={`${fleet.degraded} degraded`} variant="amber" href="/control" />
      )}
      {fleet.running > 0 && (
        <Pill icon={Bot} value={`${fleet.running} running`} variant="accent" href="/control" />
      )}
      {fleet.waiting > 0 && (
        <Pill icon={Bot} value={`${fleet.waiting} waiting`} variant="green" href="/control" />
      )}
      <IvyDispatchButton
        prompt={todayBriefPrompt}
        title="Brief Ivy on today"
        label="Brief Ivy"
        className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-base px-3 py-2 text-xs font-medium text-text-secondary hover:text-status-positive hover:border-status-positive/30 transition-colors min-h-11 sm:min-h-0 shrink-0"
      />
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
  variant?: "amber" | "red" | "green" | "accent";
  href?: string;
}) {
  const colors = variant === "red"
    ? "border-status-negative/20 bg-status-negative-subtle text-status-negative"
    : variant === "amber"
      ? "border-status-warning/20 bg-status-warning-subtle text-status-warning"
      : variant === "green"
        ? "border-status-positive/20 bg-status-positive-subtle text-status-positive"
        : variant === "accent"
          ? "border-accent-primary/20 bg-accent-muted text-accent-text"
          : "border-border-default bg-surface-base text-text-secondary";

  const inner = (
    <>
      <Icon className="h-3 w-3" />
      <span>{value}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80 min-h-11 sm:min-h-0 shrink-0 ${colors}`}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium shrink-0 ${colors}`}>
      {inner}
    </div>
  );
}
