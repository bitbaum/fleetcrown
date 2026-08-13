import { db } from "@/db";
import { newsletterSubscribers } from "@/db/schema";

/**
 * Idempotent subscribe — the ONLY write path to newsletter_subscribers.
 * Normalizes the email here so the unique constraint on `email` is
 * effectively case-insensitive. A repeat signup (any casing) is a silent
 * no-op: the visitor asked to be on the list and they are — that is success.
 */
export async function subscribeToNewsletter(email: string, source: string): Promise<void> {
  await db
    .insert(newsletterSubscribers)
    .values({ email: email.trim().toLowerCase(), source })
    .onConflictDoNothing();
}
