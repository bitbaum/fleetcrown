import { Suspense } from "react";
import { PageLayout } from "@/components/ui/page-layout";
import { SystemStats } from "@/components/system/SystemStats";
import { AutopilotCard } from "@/components/system/AutopilotCard";
import { MemorySummaryCard } from "@/components/system/MemorySummaryCard";
import { RecentFailuresCard } from "@/components/system/RecentFailuresCard";
import { CardSkeleton } from "@/components/ui/card";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { AutoRefresh } from "@/components/shared/AutoRefresh";
import { REFRESH_CADENCE } from "@/config/refresh";
import { requirePageUserId } from "@/lib/session";
import { listCronJobsForUser } from "@/db/queries/cron-jobs";

export const metadata = { title: "System" };

export default async function SystemPage() {
  const userId = await requirePageUserId();
  const jobs = await listCronJobsForUser(userId);

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
        <AutoRefresh intervalMs={REFRESH_CADENCE.system} />
      </PageLayout>
    </PullToRefresh>
  );
}
