import { PageLayout } from "@/components/ui/page-layout";
import { getEvents, getArchivedEvents } from "@/db/queries/events";
import { EventsGrid } from "@/components/events/EventsGrid";

export default async function EventsPage() {
  const [items, archived] = await Promise.all([getEvents(), getArchivedEvents()]);
  return (
    <PageLayout
      title="Events"
      subtitle="Opportunities, deadlines, and what's coming up"
    >
      <EventsGrid initialEvents={items} initialArchived={archived} />
    </PageLayout>
  );
}
