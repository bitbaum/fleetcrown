import { PageLayout } from "@/components/ui/page-layout";
import { searchPeople, SORT_MODE } from "@/db/queries/people";
import { PeopleGrid } from "@/components/people/PeopleGrid";
import { RELATIONSHIP_HEALTH_VALUES, type RelationshipHealth } from "@/lib/utils";
import { getCurrentUserId } from "@/lib/session";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ health?: string; q?: string; sort?: string }>;
}) {
  const params = await searchParams;

  // Parse health filter from URL (e.g. ?health=fading%2Cstale)
  const initialHealthFilter: RelationshipHealth[] = params.health
    ? params.health
        .split(",")
        .filter((v): v is RelationshipHealth =>
          RELATIONSHIP_HEALTH_VALUES.includes(v as RelationshipHealth),
        )
    : [];

  const userId = await getCurrentUserId();
  const { people, total } = await searchPeople(userId, "", 50, 0, SORT_MODE.RECENT, initialHealthFilter);

  return (
    <PageLayout
      title="People"
      subtitle={`Your social graph — ${total} contacts with context`}
      maxWidth="max-w-5xl"
    >
      <PeopleGrid
        initialPeople={people}
        initialTotal={total}
        initialHealthFilter={initialHealthFilter}
      />
    </PageLayout>
  );
}
