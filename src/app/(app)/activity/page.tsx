import { PageLayout } from "@/components/ui/page-layout";
import { ActivityView } from "@/components/activity/ActivityView";
import { requirePageUserId } from "@/lib/session";

export const metadata = { title: "Activity" };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; project?: string; density?: string }>;
}) {
  const userId = await requirePageUserId();
  const params = await searchParams;

  return (
    <PageLayout
      title="Activity"
      subtitle="What your fleet has done. Project status at a glance, every event in order."
      maxWidth="max-w-5xl"
    >
      <ActivityView
        userId={userId}
        window={params.window}
        project={params.project}
        density={params.density}
      />
    </PageLayout>
  );
}
