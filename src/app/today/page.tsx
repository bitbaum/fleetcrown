import { Suspense } from "react";
import { DEFAULT_USER_NAME } from "@/lib/constants";
import { CardSkeleton } from "@/components/ui/card";
import { ActionQueueCard } from "@/components/today/ActionQueueCard";
import { AlertsCard } from "@/components/today/AlertsCard";
import { CalendarCard } from "@/components/today/CalendarCard";
import { WeatherCard } from "@/components/today/WeatherCard";
import { CommitmentsCard } from "@/components/today/CommitmentsCard";
import { SubscriptionsCard } from "@/components/today/SubscriptionsCard";

export default function TodayPage() {
  const now = new Date();
  const greeting = getGreeting(now.getHours());

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
        <p className="text-sm text-white/40 mt-1">
          {now.toLocaleDateString("en-CH", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense fallback={<CardSkeleton />}>
          <ActionQueueCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <AlertsCard />
        </Suspense>
        <CalendarCard />
        <WeatherCard />
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

function getGreeting(hour: number): string {
  if (hour < 5) return `Good night, ${DEFAULT_USER_NAME}`;
  if (hour < 12) return `Good morning, ${DEFAULT_USER_NAME}`;
  if (hour < 17) return `Good afternoon, ${DEFAULT_USER_NAME}`;
  if (hour < 21) return `Good evening, ${DEFAULT_USER_NAME}`;
  return `Good night, ${DEFAULT_USER_NAME}`;
}
