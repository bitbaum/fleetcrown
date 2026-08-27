import { notFound } from "next/navigation";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { PublicSurface } from "@/components/public/PublicSurface";
import { SharedTaskView } from "@/components/crew/SharedTaskView";
import { getSharedTask, markSharedTaskViewed } from "@/db/queries/human-tasks";

export const metadata = { title: "An ask for you" };

/**
 * The assignee's whole relationship with FleetCrown: one link, no account.
 *
 * A revoked or unknown token is a 404 with nothing else said — the operator
 * pulling an ask back should not leave behind a page that confirms it ever
 * existed, let alone who it was for.
 */
export default async function SharedTaskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const task = await getSharedTask(token).catch(() => null);
  if (!task) notFound();

  // Best-effort receipt so the operator can see the link was opened. Never
  // blocks the render, and a failure here changes nothing for either side.
  await markSharedTaskViewed(token).catch(() => {});

  return (
    <PublicSurface right={<PublicHeaderActions />} showNav={false}>
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <SharedTaskView token={token} initialTask={task} />
      </main>
    </PublicSurface>
  );
}
