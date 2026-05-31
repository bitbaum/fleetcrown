import { Target, Bell, Inbox, AlertCircle, Clock, Calendar, Users, Repeat2, Bot, Activity, CirclePause, ChevronRight } from "lucide-react";
import Link from "next/link";
import { IvyDispatchButton } from "@/components/shared/IvyDispatchButton";
import { getTodaySummary, getFleetSummary } from "@/db/queries/today";
import { requirePageUserId } from "@/lib/session";
import { APP_LOCALE } from "@/lib/constants";

/** Placeholder shown while SummaryBar's DB queries run. */
export function SummaryBarSkeleton() {
  const widths = ["5rem", "7rem", "6rem", "5rem", "5rem"];
  return (
    <div className="relative">
      <div className="flex gap-3 overflow-x-auto ui-scroll-fade-right [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible">
        {widths.map((w, i) => (
          <div
            key={i}
            style={{ width: w }}
            className="h-8 animate-pulse rounded-full border border-border-default bg-surface-raised"
          />
        ))}
      </div>
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

  // Group chips by semantic so the row reads as: "what I have" → "what wants me"
  // → "what my fleet is doing" → "ask Ivy." Previously 10+ mixed chips with
  // unit confusion ("0/2 habits" next to "1 urgent") and the action button
  // styled identically to a status chip. Three counts arrays + thin dividers
  // give scannable hierarchy while still wrapping cleanly on mobile.
  const counters = [
    s.activeGoals > 0 && <Pill key="g" icon={Target} value={`${s.activeGoals} goals · ${s.avgGoalProgress}%`} href="/goals" />,
    s.habitsTotal > 0 && (
      <Pill
        key="h"
        icon={Repeat2}
        value={`${s.habitsDone}/${s.habitsTotal} habits`}
        variant={s.habitsDone === s.habitsTotal ? "green" : undefined}
        href="#habits"
      />
    ),
    s.staleContacts > 0 && (
      <Pill key="c" icon={Users} value={`${s.staleContacts} contacts`} variant="amber" href="/people?health=stale" />
    ),
  ].filter(Boolean);

  const alerts = [
    s.overdueCommitments > 0 && <Pill key="o" icon={AlertCircle} value={`${s.overdueCommitments} overdue`} variant="red" href="#commitments" />,
    s.urgentAlerts > 0 && <Pill key="u" icon={Bell} value={`${s.urgentAlerts} urgent`} variant="red" href="#alerts" />,
    s.goalsDueSoon > 0 && <Pill key="gd" icon={Clock} value={`${s.goalsDueSoon} goal${s.goalsDueSoon > 1 ? "s" : ""} due soon`} variant="amber" href="/goals" />,
    s.stuckGoals > 0 && <Pill key="gs" icon={CirclePause} value={`${s.stuckGoals} goal${s.stuckGoals > 1 ? "s" : ""} stalled`} variant="amber" href="#stuck-goals" />,
    s.eventsDueSoon > 0 && <Pill key="ed" icon={Calendar} value={`${s.eventsDueSoon} deadline${s.eventsDueSoon > 1 ? "s" : ""}`} variant="amber" href="/events" />,
    s.pendingDrafts > 0 && <Pill key="pd" icon={Inbox} value={`${s.pendingDrafts} drafts`} variant="amber" href="#actions" />,
  ].filter(Boolean);

  const fleetPills = [
    fleet.running > 0 && <Pill key="fr" icon={Bot} value={`${fleet.running} running`} variant="accent" href="/control" />,
    fleet.waiting > 0 && <Pill key="fw" icon={Bot} value={`${fleet.waiting} waiting`} variant="green" href="/control" />,
    fleet.degraded > 0 && <Pill key="fd" icon={Activity} value={`${fleet.degraded} degraded`} variant="amber" href="/control" />,
  ].filter(Boolean);

  // Hairline divider — vertical line between groups when wrapped on desktop,
  // invisible-but-spacing on horizontal-scroll mobile. Inlined (not a local
  // component) to satisfy react-hooks/static-components.
  const divider = (
    <span aria-hidden className="hidden sm:inline-block h-6 w-px bg-border-subtle self-center mx-1" />
  );

  // Mobile-only scroll affordance: a small chevron pinned to the right edge
  // tells the user "more chips this way." ui-scroll-fade-right alone is too
  // subtle on iOS (native scrollbars hide at rest). pointer-events-none so
  // it never blocks a chip tap underneath. Hidden on sm+ where chips wrap.
  const scrollHint = (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center pr-1 text-text-tertiary sm:hidden"
    >
      <ChevronRight className="h-4 w-4 drop-shadow-[0_0_4px_var(--surface-page)]" />
    </span>
  );

  const totalChipCount = counters.length + alerts.length + fleetPills.length;

  return (
    <div className="relative">
      <div className="flex gap-3 overflow-x-auto ui-scroll-fade-right [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible">
        {counters}
        {counters.length > 0 && (alerts.length > 0 || fleetPills.length > 0) && divider}
        {alerts}
        {alerts.length > 0 && fleetPills.length > 0 && divider}
        {fleetPills}
        {(counters.length > 0 || alerts.length > 0 || fleetPills.length > 0) && divider}
        <IvyDispatchButton
          prompt={todayBriefPrompt}
          title="Brief Ivy on today"
          label="Brief Ivy"
          className="inline-flex items-center gap-1.5 rounded-full border border-status-positive/30 bg-status-positive-subtle/40 px-3 py-2 text-xs font-semibold text-status-positive hover:bg-status-positive-subtle transition-colors min-h-11 sm:min-h-0 shrink-0"
        />
      </div>
      {totalChipCount >= 3 && scrollHint}
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
