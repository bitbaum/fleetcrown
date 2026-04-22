import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import path from "path";
import { PageLayout } from "@/components/ui/page-layout";
import { SystemStats } from "@/components/system/SystemStats";
import { AutopilotCard } from "@/components/system/AutopilotCard";
import type { CronJob } from "@/app/api/crons/route";

function loadJobs(): CronJob[] {
  const file = path.join(homedir(), ".openclaw", "cron", "jobs.json");
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf-8"));
    return data.jobs ?? [];
  } catch {
    return [];
  }
}

export default function SystemPage() {
  const jobs = loadJobs();

  return (
    <PageLayout title="System" subtitle="Infrastructure health and Ivy autopilot">
      <SystemStats />
      <AutopilotCard initialJobs={jobs} />
    </PageLayout>
  );
}
