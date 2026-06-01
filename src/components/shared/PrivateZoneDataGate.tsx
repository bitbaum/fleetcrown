import { requirePageUserId } from "@/lib/session";
import { isPrivateZoneLocked } from "@/lib/private-zone";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

/**
 * Gates server-rendered private data on non-private pages (e.g. Today summaries).
 * When PIN is configured and the httpOnly cookie is absent, shows a placeholder.
 */
export async function PrivateZoneDataGate({
  children,
  label = "private data",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const userId = await requirePageUserId();
  if (await isPrivateZoneLocked(userId)) {
    return (
      <EmptyState>
        <Link href="/unlock" className="text-accent-text underline-offset-2 hover:underline">
          Unlock the private zone
        </Link>
        {" "}to view {label}.
      </EmptyState>
    );
  }
  return <>{children}</>;
}
