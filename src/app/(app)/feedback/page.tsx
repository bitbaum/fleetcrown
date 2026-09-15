import { Suspense } from "react";
import { PageLayout } from "@/components/ui/page-layout";
import { CardSkeleton } from "@/components/ui/card";
import { requirePageUserId } from "@/lib/session";
import { FeedbackInbox } from "@/components/feedback/FeedbackInbox";
import { FeedbackTabs } from "@/components/feedback/FeedbackTabs";

export const metadata = { title: "Feedback" };

/**
 * The feedback product's own front door (SoC): visitor reports, AI-review
 * findings, and synthesized briefs across every project, each with the live
 * phase of its fix. Control stays operations; Projects stays the catalog;
 * the ironing-out loop lives here.
 *
 * This page is the RECEIVED side — reports addressed to your projects. Its
 * sibling /feedback/sent is what you reported on other people's sites. Same
 * heading, two relationships.
 */
export default async function FeedbackPage() {
  await requirePageUserId();
  return (
    <PageLayout
      title="Feedback"
      subtitle="Reports your projects received, and where each fix stands."
      maxWidth="max-w-5xl"
    >
      <FeedbackTabs active="received" />
      <Suspense fallback={<CardSkeleton />}>
        <FeedbackInbox />
      </Suspense>
    </PageLayout>
  );
}
