import { PageLayout } from "@/components/ui/page-layout";
import { searchPeople } from "@/db/queries/people";
import { PeopleGrid } from "@/components/people/PeopleGrid";

export default async function PeoplePage() {
  const { people, total } = await searchPeople("", 50, 0);

  return (
    <PageLayout
      title="People"
      subtitle={`Your social graph — ${total} contacts with context`}
      maxWidth="max-w-5xl"
    >
      <PeopleGrid initialPeople={people} initialTotal={total} />
    </PageLayout>
  );
}
