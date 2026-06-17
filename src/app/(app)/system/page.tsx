import { Suspense } from "react";
import { PageLayout } from "@/components/ui/page-layout";
import { SystemStats } from "@/components/system/SystemStats";
import { ScheduledJobsCard } from "@/components/system/ScheduledJobsCard";
import { MemorySummaryCard } from "@/components/system/MemorySummaryCard";
import { RecentFailuresCard } from "@/components/system/RecentFailuresCard";
import { FleetDoctorCard } from "@/components/system/FleetDoctorCard";
import { RecentControlAuditCard } from "@/components/system/RecentControlAuditCard";
import { GlobalAutoContinueCard } from "@/components/system/GlobalAutoContinueCard";
import { CardSkeleton } from "@/components/ui/card";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { AutoRefresh } from "@/components/shared/AutoRefresh";
import { REFRESH_CADENCE } from "@/config/refresh";
import { requirePageUserId } from "@/lib/session";
import { listCronJobsForUser } from "@/db/queries/cron-jobs";

export const metadata = { title: "System" };

export default async function SystemPage() {
  const userId = await requirePageUserId();
  // listCronJobsForUser is the only direct DB await on this route. When it
  // throws (DB connectivity blip, table not provisioned on a
  // fresh branch, etc.) the entire page crashes into the global error
  // boundary — caught live on fleetcrown.orangecat.ch/system showing
  // "Something went wrong" with the Server Components render error.
  // Defensive: fall back to an empty list so the rest of the page renders
  // (ScheduledJobsCard handles empty initialJobs cleanly). The error is
  // captured in console so postmortem still works.
  let jobs: Awaited<ReturnType<typeof listCronJobsForUser>> = [];
  try {
    jobs = await listCronJobsForUser(userId);
  } catch (err) {
    console.error("[system/page] listCronJobsForUser failed:", err);
  }

  return (
    <PullToRefresh>
      <PageLayout title="System" subtitle="Infrastructure health and scheduled jobs">
        <SystemStats />
        <FleetDoctorCard />
        <GlobalAutoContinueCard />
        <ScheduledJobsCard initialJobs={jobs} />
        <Suspense fallback={<CardSkeleton />}>
          <MemorySummaryCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <RecentFailuresCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <RecentControlAuditCard userId={userId} />
        </Suspense>
        <AutoRefresh intervalMs={REFRESH_CADENCE.system} />
      </PageLayout>
    </PullToRefresh>
  );
}
