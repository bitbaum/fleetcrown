import { redirect } from "next/navigation";
import { consumeEmailVerificationToken } from "@/db/queries/emailVerification";

// Handles /verify-email/<token> links from the verification email
export default async function VerifyEmailTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const userId = await consumeEmailVerificationToken(token);

  if (!userId) {
    redirect("/verify-email?error=invalid");
  }

  redirect("/verify-email?success=1");
}
