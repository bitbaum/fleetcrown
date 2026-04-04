import { Suspense } from "react";
import { CalendarCard } from "@/components/today/CalendarCard";
import { WeatherCard } from "@/components/today/WeatherCard";
import { CommitmentsCard } from "@/components/today/CommitmentsCard";
import { SubscriptionsCard } from "@/components/today/SubscriptionsCard";

function CardSkeleton() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 animate-pulse">
      <div className="h-4 bg-white/10 rounded w-24 mb-3" />
      <div className="space-y-2">
        <div className="h-3 bg-white/5 rounded w-full" />
        <div className="h-3 bg-white/5 rounded w-3/4" />
      </div>
    </div>
  );
}

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
  if (hour < 5) return "Good night, George";
  if (hour < 12) return "Good morning, George";
  if (hour < 17) return "Good afternoon, George";
  if (hour < 21) return "Good evening, George";
  return "Good night, George";
}
