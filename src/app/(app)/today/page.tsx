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
import { QuickCaptureButton } from "@/components/today/QuickCaptureButton";
import { HabitsCard } from "@/components/today/HabitsCard";
import { RecentRunsCard } from "@/components/today/RecentRunsCard";
import { StuckGoalsCard } from "@/components/today/StuckGoalsCard";
import { LockedZoneBanner } from "@/components/today/LockedZoneBanner";
import { TodayWatch } from "@/components/today/TodayWatch";
import { LayoutGrid } from "lucide-react";
import { APP_NAME } from "@/config/brand";
import { IvyDispatchButton } from "@/components/shared/IvyDispatchButton";
import { requirePageUserId, getCurrentUserName } from "@/lib/session";
import { getUserProjects, getOrgProjects } from "@/db/queries/user-projects";
import { PLAN_DAY_PROMPT, WRAP_UP_PROMPT } from "@/lib/constants/today";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { AutoRefresh } from "@/components/shared/AutoRefresh";
import { REFRESH_CADENCE } from "@/config/refresh";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const [name, userId] = await Promise.all([getCurrentUserName(), requirePageUserId()]);
  const [projects, orgProjects] = await Promise.all([
    getUserProjects(userId),
    getOrgProjects(userId),
  ]);
  const isFirstRun = projects.length === 0 && orgProjects.length === 0;
  const hour = new Date().getHours();
  const isEvening = hour >= 17;
  return (
    <PullToRefresh>
    <div className="app-page max-w-4xl space-y-6">
      <div>
        <Greeting name={name} />
        {isFirstRun && (
          <div className="ui-callout-accent mt-4">
            <LayoutGrid className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text-primary">Register your first project to get started</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                {APP_NAME} tracks your AI agent sessions, git state, and progress across projects — add one to the control panel to unlock the fleet view.
              </p>
              <Link href={NAV.control.href} className="mt-3 inline-flex items-center min-h-11 sm:min-h-0 gap-1.5 text-sm font-medium text-accent-text hover:opacity-80 transition-opacity">
                Go to Control Panel →
              </Link>
            </div>
          </div>
        )}
        <Suspense fallback={<div className="mt-2"><SummaryBarSkeleton /></div>}>
          <div className="mt-2">
            <SummaryBar />
          </div>
        </Suspense>
        <div className="mt-3 ui-quick-actions-row ui-scroll-fade-right">
          {isEvening ? (
            <IvyDispatchButton
              prompt={WRAP_UP_PROMPT}
              label="Wrap up day"
              title="Ask Ivy to run your end-of-day review"
              className="ui-btn-pill-positive"
            />
          ) : (
            <IvyDispatchButton
              prompt={PLAN_DAY_PROMPT}
              label="Plan my day"
              title="Ask Ivy to plan your day"
              className="ui-btn-pill-positive"
            />
          )}
          <LogConversationButton />
          <QuickCaptureButton />
        </div>
      </div>

      <Suspense fallback={null}>
        <LockedZoneBanner />
      </Suspense>

      {/* Ivy's proactive read on the private zone — one thing to focus on,
          plus a totals strip across categories. Renders only when unlocked. */}
      <Suspense fallback={<CardSkeleton />}>
        <TodayWatch />
      </Suspense>

      {/* Recent agent outcomes — what agents shipped since last visit */}
      <Suspense fallback={<CardSkeleton />}>
        <RecentRunsCard />
      </Suspense>

      {/* Actionable first — what needs your decision */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
    </div>
    </PullToRefresh>
  );
}
