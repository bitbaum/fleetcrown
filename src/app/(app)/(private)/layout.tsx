import { Suspense } from "react";
import { requirePageUserId } from "@/lib/session";
import { isPrivateZoneLocked } from "@/lib/private-zone";
import { PrivatePinGate } from "@/components/shared/PrivatePinGate";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const userId = await requirePageUserId();

  if (await isPrivateZoneLocked(userId)) {
    return (
      <Suspense>
        <PrivatePinGate />
      </Suspense>
    );
  }

  return <>{children}</>;
}
