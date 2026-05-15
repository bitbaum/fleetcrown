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
import { getCurrentUserName } from "@/lib/session";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const name = await getCurrentUserName();
  return (
    <div className="app-page max-w-4xl space-y-6">
      <div>
        <Greeting name={name} />
        <Suspense fallback={null}>
          <div className="mt-2">
            <SummaryBar />
          </div>
        </Suspense>
        <div className="mt-3 flex flex-wrap gap-2">
          <LogConversationButton />
          <QuickCaptureButton />
        </div>
      </div>

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
