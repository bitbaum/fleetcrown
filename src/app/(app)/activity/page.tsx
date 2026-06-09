import { ActivityShell } from "@/components/activity/ActivityShell";
import { DigestsView } from "@/components/activity/DigestsView";
import { requirePageUserId } from "@/lib/session";

export const metadata = { title: "Activity" };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; project?: string }>;
}) {
  const userId = await requirePageUserId();
  const params = await searchParams;

  return (
    <ActivityShell active="digests">
      <DigestsView userId={userId} window={params.window} project={params.project} />
    </ActivityShell>
  );
}
