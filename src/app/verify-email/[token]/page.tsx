import { redirect } from "next/navigation";
import { consumeEmailVerificationToken } from "@/db/queries/emailVerification";
import { claimReportsByVerifiedEmail } from "@/lib/feedback/claim";
import { ROUTES } from "@/config/auth";

// Handles /verify-email/<token> links from the verification email
export default async function VerifyEmailTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const userId = await consumeEmailVerificationToken(token);

  if (!userId) {
    redirect(`${ROUTES.VERIFY_EMAIL}?error=invalid`);
  }

  // The moment the address is PROVEN — and therefore the first moment feedback
  // filed under it may be attributed to this account. Anything reported before
  // signing up (which, for a reporter who found Loki through a widget on
  // someone else's site, is all of it) is now in their Sent list without them
  // having to hunt down the link from each one.
  //
  // Deliberately after the redirect guard and swallowing its own failures:
  // verification is the thing that must not fail here.
  await claimReportsByVerifiedEmail(userId);

  redirect(`${ROUTES.VERIFY_EMAIL}?success=1`);
}
