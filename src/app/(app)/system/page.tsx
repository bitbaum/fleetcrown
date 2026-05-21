import { Suspense } from "react";
import { PageLayout } from "@/components/ui/page-layout";
import { SystemStats } from "@/components/system/SystemStats";
import { AutopilotCard } from "@/components/system/AutopilotCard";
import { MemorySummaryCard } from "@/components/system/MemorySummaryCard";
import { RecentFailuresCard } from "@/components/system/RecentFailuresCard";
import { CardSkeleton } from "@/components/ui/card";
import { readCronJobs } from "@/lib/crons";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { AutoRefresh } from "@/components/shared/AutoRefresh";

export const metadata = { title: "System" };

export default function SystemPage() {
  const jobs = readCronJobs();

  return (
    <PullToRefresh>
      <PageLayout title="System" subtitle="Infrastructure health and Ivy autopilot">
        <SystemStats />
        <AutopilotCard initialJobs={jobs} />
        <Suspense fallback={<CardSkeleton />}>
          <MemorySummaryCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <RecentFailuresCard />
        </Suspense>
        {/* 30s revalidation so debug_logs rows that land NOW appear without manual refresh. */}
        <AutoRefresh intervalMs={30_000} />
      </PageLayout>
    </PullToRefresh>
  );
}
