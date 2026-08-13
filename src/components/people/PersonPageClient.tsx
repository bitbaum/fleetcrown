"use client";

import { useRouter } from "next/navigation";
import { PageLayout } from "@/components/ui/page-layout";
import { PersonDetail } from "./PersonDetail";

export function PersonPageClient({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  const back = () => router.push("/people");

  return (
    <PageLayout title={name} subtitle="Private profile — your notes, not a public listing" maxWidth="max-w-xl">
      <PersonDetail
        personId={personId}
        variant="page"
        onClose={back}
        onDeleted={back}
      />
    </PageLayout>
  );
}
