import { PageLayout } from "@/components/ui/page-layout";
import { getEvents } from "@/db/queries/events";
import { EventsGrid } from "@/components/events/EventsGrid";

export default async function EventsPage() {
  const items = await getEvents();
  return (
    <PageLayout
      title="Events"
      subtitle="Opportunities, deadlines, and what's coming up"
    >
      <EventsGrid initialEvents={items} />
    </PageLayout>
  );
}
