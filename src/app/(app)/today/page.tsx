import Link from "next/link";
import { Suspense } from "react";
import { CardSkeleton } from "@/components/ui/card";
import { Greeting } from "@/components/today/Greeting";
import { SummaryBar } from "@/components/today/SummaryBar";
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
import { IvyDispatchButton } from "@/components/shared/IvyDispatchButton";
import { getCurrentUserId, getCurrentUserName } from "@/lib/session";
import { getUserProjects } from "@/db/queries/user-projects";

const PLAN_DAY_PROMPT = `Plan my day.

Check in Cockpit and the codebase:
- Which of my active projects has the most urgent open work or is blocking a goal?
- Which goals are due soon or have been stuck at 0% for 30+ days?
- Are there any commitments or events with deadlines in the next 3 days?
- Which habit am I most at risk of breaking today?

Then give me:
1. The ONE thing I should work on first today (be specific — project name + what exactly)
2. Three concrete tasks for it (each under 10 words)
3. One person I should reach out to and why

Under 150 words. No hedging.`;

const WRAP_UP_PROMPT = `Run my end-of-day wrap-up.

1. Check git commits across all active projects since this morning — what actually shipped?
2. What is currently blocked or waiting on input?
3. Review open commitments — anything overdue or due tomorrow?
4. Did I make progress on my highest-priority goal today?
5. What is the single first task to do tomorrow morning?

Be direct. If nothing shipped, say so. Under 150 words.`;

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const [name, userId] = await Promise.all([getCurrentUserName(), getCurrentUserId()]);
  const projects = await getUserProjects(userId);
  const isFirstRun = projects.length === 0;
  const hour = new Date().getHours();
  const isEvening = hour >= 17;
  return (
    <div className="app-page max-w-4xl space-y-6">
      <div>
        <Greeting name={name} />
        {isFirstRun && (
          <div className="mt-4 flex items-start gap-4 rounded-2xl border border-accent-primary/20 bg-accent-muted px-5 py-4">
            <span className="mt-0.5 shrink-0 text-xl">⊞</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text-primary">Register your first project to get started</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                Cockpit tracks your AI agent sessions, git state, and progress across projects — add one to the control panel to unlock the fleet view.
              </p>
              <Link href="/control" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:opacity-80 transition-opacity">
                Go to Control Panel →
              </Link>
            </div>
          </div>
        )}
        <Suspense fallback={null}>
          <div className="mt-2">
            <SummaryBar />
          </div>
        </Suspense>
        <div className="mt-3 flex flex-wrap gap-2">
          {isEvening ? (
            <IvyDispatchButton
              prompt={WRAP_UP_PROMPT}
              label="Wrap up day"
              title="Ask Ivy to run your end-of-day review"
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-status-positive bg-surface-raised hover:bg-surface-overlay border border-border-subtle hover:border-status-positive/30 rounded-full px-3 py-1.5 transition-colors"
            />
          ) : (
            <IvyDispatchButton
              prompt={PLAN_DAY_PROMPT}
              label="Plan my day"
              title="Ask Ivy to plan your day"
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-status-positive bg-surface-raised hover:bg-surface-overlay border border-border-subtle hover:border-status-positive/30 rounded-full px-3 py-1.5 transition-colors"
            />
          )}
          <LogConversationButton />
          <QuickCaptureButton />
        </div>
      </div>

      {/* Recent agent outcomes — what agents shipped since last visit */}
      <Suspense fallback={null}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RecentRunsCard />
        </div>
      </Suspense>

      {/* Actionable first — what needs your decision */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense fallback={<CardSkeleton />}>
          <ActionQueueCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <AlertsCard />
        </Suspense>
        <Suspense fallback={null}>
          <GoalsDueCard />
        </Suspense>
        <Suspense fallback={null}>
          <EventsDueCard />
        </Suspense>
        <Suspense fallback={null}>
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
    </div>
  );
}
