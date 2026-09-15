/**
 * When a feedback report becomes "mine".
 *
 * A report is filed through a PUBLIC, unauthenticated endpoint whose token sits
 * in the customer's page source. Nothing about a submission proves who made it
 * — the address on it is simply what somebody typed. So attribution needs an
 * act by the ACCOUNT, and there are exactly two that qualify:
 *
 *   1. POSSESSION — the account opens the report's track link. The token is
 *      unguessable and was handed only to whoever filed the report, so holding
 *      it is the proof, the same way a password-reset link is.
 *
 *   2. A PROVEN ADDRESS — the account's own email is verified AND matches the
 *      address on the report. This is what makes "register and your reports are
 *      already there" work.
 *
 * Rule 2 is the weaker of the two and it is fenced accordingly: `emailVerified`
 * must be set. Without that gate, registering with someone else's address would
 * show you their reports. WITH it, the residual is that anyone can file a
 * report claiming an address they do not own, and it will later appear in that
 * person's Sent list — spam into a list, and nothing more: the row contains the
 * sender's own words, and it grants no access to anything of the victim's. That
 * is the same trust level the product already extends to the address when it
 * emails it about the fix.
 *
 * Both paths only ever fill an EMPTY submitterUserId. A report is never
 * re-pointed at a second account, so a forwarded link cannot move somebody's
 * report out of their own list.
 */
import { claimFeedbackByEmail, claimFeedbackByTrackToken } from "@/db/queries/site-feedback";
import { getUserById } from "@/db/queries/users";

/** Rule 1 — the reader is holding this report's track link. */
export async function claimReportByLink(token: string, userId: string): Promise<boolean> {
  try {
    return await claimFeedbackByTrackToken(token, userId);
  } catch (err) {
    // Reading the report must never fail because binding it did. The page
    // renders either way; the reader just doesn't get it filed under Sent yet.
    console.error("[feedback-claim] link:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Rule 2 — sweep in every unclaimed report filed from this account's VERIFIED
 * address. Returns how many were bound (0 whenever the address is unverified,
 * which is not an error — it is the gate doing its job).
 *
 * Safe to call often: it is a no-op once there is nothing left unclaimed, which
 * is why the Sent list can run it on load and pick up reports filed since.
 */
export async function claimReportsByVerifiedEmail(userId: string): Promise<number> {
  try {
    const user = await getUserById(userId);
    if (!user?.email || !user.emailVerified) return 0;
    return await claimFeedbackByEmail(user.email, userId);
  } catch (err) {
    console.error("[feedback-claim] email:", err instanceof Error ? err.message : err);
    return 0;
  }
}
