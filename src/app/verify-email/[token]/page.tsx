import { redirect } from "next/navigation";
import { consumeEmailVerificationToken } from "@/db/queries/emailVerification";
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

  redirect(`${ROUTES.VERIFY_EMAIL}?success=1`);
}
