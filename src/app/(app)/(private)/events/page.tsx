import { PageLayout } from "@/components/ui/page-layout";
import { getEvents, getArchivedEvents } from "@/db/queries/events";
import { requirePageUserId } from "@/lib/session";
import { EventsGrid } from "@/components/events/EventsGrid";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const userId = await requirePageUserId();
  const [items, archived] = await Promise.all([getEvents(userId), getArchivedEvents(userId)]);
  return (
    <PageLayout title="Events" subtitle="Opportunities, deadlines, and what's coming up">
      <EventsGrid initialEvents={items} initialArchived={archived} />
    </PageLayout>
  );
}
