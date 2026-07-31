/**
 * Account-export helpers (data controls). Pure functions, unit-tested.
 *
 * The export must never leak secrets the user cannot already read in the UI:
 * password/PIN hashes and Stripe internals are stripped from the users row.
 */

export const ACCOUNT_EXPORT_FILENAME = "fleetcrown-account-export.json";

const REDACTED_USER_FIELDS = [
  "passwordHash",
  "privateZonePinHash",
  "stripeCustomerId",
  "stripeSubscriptionId",
] as const;

/** Strip credential hashes + billing internals from a users row. */
export function redactUserRow<T extends Record<string, unknown>>(
  user: T,
): Omit<T, (typeof REDACTED_USER_FIELDS)[number]> {
  const copy: Record<string, unknown> = { ...user };
  for (const field of REDACTED_USER_FIELDS) {
    delete copy[field];
  }
  return copy as Omit<T, (typeof REDACTED_USER_FIELDS)[number]>;
}

export function buildExportManifest(userId: string, sections: string[]) {
  return {
    product: "FleetCrown",
    exported_at: new Date().toISOString(),
    user_id: userId,
    scope: sections,
    excluded: [
      "password and private-zone PIN hashes",
      "Stripe customer/subscription ids",
      "agent tokens and session tokens",
      "knowledge_embeddings vectors (chunk text and metadata are included)",
    ],
  };
}
