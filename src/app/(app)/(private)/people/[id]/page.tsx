import { PersonPageClient } from "@/components/people/PersonPageClient";

export const metadata = { title: "Person" };

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PersonPageClient personId={id} />;
}
