import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { PublicSurface } from "@/components/public/PublicSurface";
import { TrackedReportStatus } from "@/components/feedback/TrackedReportStatus";
import { getFeedbackByTrackToken } from "@/db/queries/site-feedback";
import { getSessionUserId } from "@/lib/session";
import { claimReportByLink } from "@/lib/feedback/claim";
import { resolvePublicReportView } from "@/lib/feedback/public-view";
import { isTrackTokenShape, trackPath } from "@/lib/feedback/submitter";
import { livePageHref } from "@/lib/feedback/fix-shipping";
import { PUBLIC_FEEDBACK_STEP } from "@/lib/feedback/public-status";
import { longDate } from "@/lib/dates";
import { ROUTES } from "@/config/auth";

export const metadata = {
  title: "Your report",
  // The token in this page's path is a credential. Indexed, it stops being one
  // — and a report's text is the reporter's, not ours to publish. `nofollow`
  // too, so a crawler that reaches one anyway does not walk it into anything.
  robots: { index: false, follow: false },
};
// The status changes as the fix moves; a cached copy would tell a reporter
// coming back next week whatever was true the day they filed.
export const dynamic = "force-dynamic";

/**
 * One report, for the person who filed it.
 *
 * This is the other end of the feedback loop, and for most people it is the
 * FIRST page of Loki they will ever see — they typed a sentence into a widget
 * on somebody else's website. So it answers their question before it makes any
 * offer: what you said, where you said it, what has happened since.
 *
 * Authorization is the token and nothing else. That is what lets a reporter
 * with no account follow their own report, and it is why the token is 192 bits
 * of randomness rather than an id.
 *
 * Signed in, the page behaves differently in exactly one way: the report binds
 * to that account so it joins their Sent list. The widget cannot do this itself
 * — it runs cross-origin inside a customer's page and cannot see a Loki session
 * — and asking the public ingest "does this address have an account?" would
 * make it an enumeration oracle. Reading the reader's OWN cookie, here, leaks
 * nothing about anybody.
 */
export default async function TrackedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Shape first so junk paths never reach the database.
  if (!isTrackTokenShape(token)) notFound();

  const report = await getFeedbackByTrackToken(token).catch(() => null);
  // An unknown token says nothing else — not "expired", not "revoked". A wrong
  // guess must not be distinguishable from a right one that was withdrawn.
  if (!report) notFound();

  const viewerId = await getSessionUserId();
  if (viewerId) await claimReportByLink(token, viewerId);

  const { status, didLine } = await resolvePublicReportView(report);
  const shipped = status.step === PUBLIC_FEEDBACK_STEP.SHIPPED;
  // Where they reported it — the project's own public origin plus the reported
  // path, falling back to the URL they filed from.
  const liveHref = livePageHref(report.liveUrl, report.url, report.page);

  return (
    <PublicSurface right={<PublicHeaderActions />} showNav={false}>
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <header>
          <p className="ui-track-meta">Your report · {report.projectName}</p>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary sm:text-3xl">
            {shipped ? "This one shipped" : "Here's where it stands"}
          </h1>
        </header>

        <section className="mt-8">
          <TrackedReportStatus status={status} />
        </section>

        <section className="mt-8 space-y-3">
          <p className="ui-track-meta">What you said</p>
          <blockquote className="ui-track-quote">{report.suggestion}</blockquote>
          <p className="ui-track-meta">
            Sent {longDate(report.createdAt.toISOString())}
            {report.page ? ` · ${report.page}` : ""}
          </p>
        </section>

        {didLine && (
          <section className="mt-8 space-y-3">
            <p className="ui-track-meta">What was done</p>
            <p className="ui-track-did">{didLine}</p>
          </section>
        )}

        {shipped && liveHref && (
          <section className="mt-6">
            <a className="ui-public-cta" href={liveHref} target="_blank" rel="noopener noreferrer">
              See it on the site
            </a>
          </section>
        )}

        <section className="ui-track-invite mt-10">
          {viewerId ? (
            <>
              <h2 className="ui-track-invite-title">This is in your reports</h2>
              <p className="ui-track-invite-body">
                Everything you send from any site running Loki collects in one place, with whatever
                state each one has reached.
              </p>
              <div className="ui-track-invite-actions">
                <Link className="ui-public-cta" href="/feedback/sent">
                  See everything you&apos;ve sent
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="ui-track-invite-title">Want to keep an eye on the rest?</h2>
              <p className="ui-track-invite-body">
                Loki is where this site&apos;s team builds. With an account, every report you send
                lands in one list — you can see what got picked up, what shipped, and keep shaping
                what gets built next. Free, and you can keep using the widget without one.
              </p>
              <div className="ui-track-invite-actions">
                {/* `next` returns them to THIS report once they are in, so the
                    account answers the question they already had rather than
                    dropping them on an empty dashboard. */}
                <Link
                  className="ui-public-cta"
                  href={`${ROUTES.SIGN_UP}?from=report&callbackUrl=${encodeURIComponent(trackPath(token))}`}
                >
                  Create a free account
                </Link>
                <Link
                  className="ui-public-cta-ghost"
                  href={`${ROUTES.SIGN_IN}?callbackUrl=${encodeURIComponent(trackPath(token))}`}
                >
                  I already have one
                </Link>
              </div>
            </>
          )}
        </section>

        <p className="ui-track-meta mt-8">
          Keep this link — it stays live, so you can come back to it any time.
        </p>
      </main>
    </PublicSurface>
  );
}
