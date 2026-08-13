import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getPersonDetail } from "@/db/queries/people";
import { PersonPageClient } from "@/components/people/PersonPageClient";

export const metadata = { title: "Person" };

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requirePageUserId();
  const { id } = await params;
  const person = await getPersonDetail(userId, id);
  if (!person) notFound();

  return <PersonPageClient personId={id} name={person.name} />;
}
