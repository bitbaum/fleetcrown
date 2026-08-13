"use client";

import { useRouter } from "next/navigation";
import { PageLayout } from "@/components/ui/page-layout";
import { PersonDetail } from "./PersonDetail";

export function PersonPageClient({ personId }: { personId: string }) {
  const router = useRouter();
  const back = () => router.push("/people");

  return (
    <PageLayout title="Person" maxWidth="max-w-xl">
      <PersonDetail
        personId={personId}
        variant="page"
        onClose={back}
        onDeleted={back}
      />
    </PageLayout>
  );
}
