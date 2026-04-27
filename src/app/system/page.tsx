import { Suspense } from "react";
import { PageLayout } from "@/components/ui/page-layout";
import { SystemStats } from "@/components/system/SystemStats";
import { AutopilotCard } from "@/components/system/AutopilotCard";
import { MemorySummaryCard } from "@/components/system/MemorySummaryCard";
import { CardSkeleton } from "@/components/ui/card";
import { readCronJobs } from "@/lib/crons";

export default function SystemPage() {
  const jobs = readCronJobs();

  return (
    <PageLayout title="System" subtitle="Infrastructure health and Ivy autopilot">
      <SystemStats />
      <AutopilotCard initialJobs={jobs} />
      <Suspense fallback={<CardSkeleton />}>
        <MemorySummaryCard />
      </Suspense>
    </PageLayout>
  );
}
