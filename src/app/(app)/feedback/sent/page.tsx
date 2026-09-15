import { PageLayout } from "@/components/ui/page-layout";
import { requirePageUserId } from "@/lib/session";
import { listFeedbackSentByUser } from "@/db/queries/site-feedback";
import { claimReportsByVerifiedEmail } from "@/lib/feedback/claim";
import { resolvePublicReportViews } from "@/lib/feedback/public-view";
import { FeedbackTabs } from "@/components/feedback/FeedbackTabs";
import { SentFeedbackList, type SentRow } from "@/components/feedback/SentFeedbackList";

export const metadata = { title: "Feedback you sent" };
export const dynamic = "force-dynamic";

/**
 * The other half of the feedback product: what YOU reported, on anyone's site.
 *
 * The claim sweep runs on load rather than only at registration. Reports keep
 * arriving after an account exists — you file one from your phone on a site
 * you're browsing, having never opened this page — and a claim that happened
 * only once, at sign-up, would leave every later report stranded behind its own
 * link. It is a no-op when there is nothing unclaimed, and it does nothing at
 * all for an unverified address (see lib/feedback/claim.ts for why that gate
 * exists).
 */
export default async function SentFeedbackPage() {
  const userId = await requirePageUserId();
  await claimReportsByVerifiedEmail(userId);

  const rows: SentRow[] = await resolvePublicReportViews(await listFeedbackSentByUser(userId));

  return (
    <PageLayout
      title="Feedback"
      subtitle="Reports you sent, and what came of them."
      maxWidth="max-w-5xl"
    >
      <FeedbackTabs active="sent" />
      <SentFeedbackList rows={rows} />
    </PageLayout>
  );
}
