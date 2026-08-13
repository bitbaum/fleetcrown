import { PageLayout } from "@/components/ui/page-layout";
import { searchRobots } from "@/db/queries/robots";
import { RobotsGrid } from "@/components/robots/RobotsGrid";
import { requirePageUserId } from "@/lib/session";

export const metadata = { title: "Robots" };

export default async function RobotsPage() {
  const userId = await requirePageUserId();
  const { robots, total } = await searchRobots(userId, "", 100, 0);

  return (
    <PageLayout
      title="Robots"
      subtitle={`${total} in your book. Humanoid, vacuum, or anything that moves — bookable, rentable, sellable. Never people.`}
      maxWidth="max-w-5xl"
    >
      <RobotsGrid initialRobots={robots} initialTotal={total} />
    </PageLayout>
  );
}
