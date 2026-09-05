import { PageLayout } from "@/components/ui/page-layout";
import { ActivityView } from "@/components/activity/ActivityView";
import { requirePageUserId } from "@/lib/session";

export const metadata = { title: "Activity" };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; project?: string; density?: string; status?: string }>;
}) {
  const userId = await requirePageUserId();
  const params = await searchParams;

  return (
    <PageLayout title="Activity" maxWidth="max-w-5xl">
      <ActivityView
        userId={userId}
        window={params.window}
        project={params.project}
        status={params.status}
      />
    </PageLayout>
  );
}
