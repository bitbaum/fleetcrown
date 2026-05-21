import { Suspense } from "react";
import { requirePageUserId } from "@/lib/session";
import { isPrivateZoneConfigured, isPrivateZoneUnlocked } from "@/lib/private-zone";
import { PrivatePinGate } from "@/components/shared/PrivatePinGate";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const userId = await requirePageUserId();

  if (isPrivateZoneConfigured() && !(await isPrivateZoneUnlocked(userId))) {
    return (
      <Suspense>
        <PrivatePinGate />
      </Suspense>
    );
  }

  return <>{children}</>;
}
