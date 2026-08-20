import Link from "next/link";
import { Suspense } from "react";
import { NAV } from "@/config/navigation";
import { CardSkeleton } from "@/components/ui/card";
import { Greeting } from "@/components/today/Greeting";
import { SummaryBar, SummaryBarSkeleton } from "@/components/today/SummaryBar";
import { ActionQueueCard } from "@/components/today/ActionQueueCard";
import { AlertsCard } from "@/components/today/AlertsCard";
import { GoalsDueCard } from "@/components/today/GoalsDueCard";
import { EventsDueCard } from "@/components/today/EventsDueCard";
import { CalendarCard } from "@/components/today/CalendarCard";
import { WeatherCard } from "@/components/today/WeatherCard";
import { CommitmentsCard } from "@/components/today/CommitmentsCard";
import { SubscriptionsCard } from "@/components/today/SubscriptionsCard";
import { LogConversationButton } from "@/components/today/LogConversationButton";
import { StickyNoteCard } from "@/components/today/StickyNoteCard";
import { HabitsCard } from "@/components/today/HabitsCard";
import { RecentRunsCard } from "@/components/today/RecentRunsCard";
import { FleetBriefCard } from "@/components/today/FleetBriefCard";
import { StuckGoalsCard } from "@/components/today/StuckGoalsCard";
import { LockedZoneBanner } from "@/components/today/LockedZoneBanner";
import { TodayWatch } from "@/components/today/TodayWatch";
import { LayoutGrid } from "lucide-react";
import { DayPhaseDispatch } from "@/components/today/DayPhaseDispatch";
import { requirePageUserId, getCurrentUserName } from "@/lib/session";
import { getUserProjects, getOrgProjects } from "@/db/queries/user-projects";
import { FIRST_RUN } from "@/lib/constants/today";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { AutoRefresh } from "@/components/shared/AutoRefresh";
import { REFRESH_CADENCE } from "@/config/refresh";

export const metadata = { title: "Today" };

async function loadTodayInputs() {
  // Inline diagnostic — /today has been crashing in production with an
  // opaque "Server Components render" error that doesn't surface in the
  // client error.message or via onRequestError. Wrap each upstream call
  // in its own try/catch, log to debug_logs with the failure site, then
  // re-throw so the error boundary still fires. Remove this once the
  // root cause is fixed and stable.
  const { logDebug } = await import("@/db/queries/debug-logs");
  async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const err = e as Error;
      await logDebug({
        source: "today/page",
        level: "error",
        message: `step '${label}' threw: ${err.message ?? String(e)}`,
        meta: { stack: (err.stack ?? "").split("\n").slice(0, 12).join("\n") },
      }).catch(() => {});
      throw e;
    }
  }
  const [name, userId] = await Promise.all([
    step("getCurrentUserName", () => getCurrentUserName()),
    step("requirePageUserId", () => requirePageUserId()),
  ]);
  const [projects, orgProjects] = await Promise.all([
    step("getUserProjects", () => getUserProjects(userId)),
    step("getOrgProjects", () => getOrgProjects(userId)),
  ]);
  return { name, userId, projects, orgProjects };
}

export default async function TodayPage() {
  const { name, userId, projects, orgProjects } = await loadTodayInputs();
  const isFirstRun = projects.length === 0 && orgProjects.length === 0;
  return (
    <PullToRefresh>
    <div className="app-page max-w-4xl space-y-6">
      <div>
        <Greeting name={name} />
        {isFirstRun && (
          <div className="ui-callout-accent mt-4">
            <LayoutGrid className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text-primary">{FIRST_RUN.title}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{FIRST_RUN.body}</p>
              <Link href={NAV.control.href} className="mt-3 inline-flex items-center ui-tap gap-1.5 text-sm font-medium text-accent-text hover:opacity-80 transition-opacity">
                {FIRST_RUN.cta} →
              </Link>
            </div>
          </div>
        )}
        {!isFirstRun && (
          <>
        <Suspense fallback={<div className="mt-2"><SummaryBarSkeleton /></div>}>
          <div className="mt-2">
            <SummaryBar />
          </div>
        </Suspense>
        <div className="mt-3 ui-quick-actions-row ui-scroll-fade-right">
          <DayPhaseDispatch />
          <LogConversationButton />
        </div>
          </>
        )}
      </div>

      {!isFirstRun && (
      <>
      <Suspense fallback={null}>
        <LockedZoneBanner />
      </Suspense>

      {/* Loki's proactive read on the private zone — one thing to focus on,
          plus a totals strip across categories. Renders only when unlocked. */}
      <Suspense fallback={<CardSkeleton />}>
        <TodayWatch />
      </Suspense>

      {/* Actionable first — what needs your decision. This has to come before
          the recap cards below it, not after: ActionQueueCard is the one card
          on this page with real Approve/Decline buttons, and on a 390px phone
          "first" is the difference between one thumb-scroll and four. It used
          to sit here in a comment but not in the layout — FleetBriefCard and
          RecentRunsCard (both read-only recap) were rendered above it, so a
          mobile user scrolled past two summaries of what ALREADY happened
          before reaching the one card asking them to decide something. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense fallback={<CardSkeleton />}>
          <StickyNoteCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <ActionQueueCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <AlertsCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <GoalsDueCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <EventsDueCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <StuckGoalsCard />
        </Suspense>
      </div>

      {/* Fleet brief — at-a-glance counts of projects/runs today + this week.
          Lives above RecentRunsCard because it answers "what happened?"
          (aggregate) before "what specifically happened?" (timeline). Both
          are recap, so both come after the decisions above. */}
      <Suspense fallback={<CardSkeleton />}>
        <FleetBriefCard userId={userId} />
      </Suspense>

      {/* Recent agent outcomes — what agents shipped since last visit */}
      <Suspense fallback={<CardSkeleton />}>
        <RecentRunsCard />
      </Suspense>

      {/* Context — what's happening today */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CalendarCard />
        <WeatherCard />
      </div>

      {/* State — what's pending */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <Suspense fallback={<CardSkeleton />}>
          <HabitsCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <CommitmentsCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <SubscriptionsCard />
        </Suspense>
      </div>
      <AutoRefresh intervalMs={REFRESH_CADENCE.today} />
      </>
      )}
    </div>
    </PullToRefresh>
  );
}
