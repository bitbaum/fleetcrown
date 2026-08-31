/**
 * Account-export helpers (data controls). Pure functions, unit-tested.
 *
 * This file used to carry its own REDACTED_USER_FIELDS deny-list — a second,
 * independent answer to "which user columns may leave the server". Two answers
 * to one question is one answer too many: a secret column added later would be
 * withheld by `/api/me` (allow-list) and shipped by the export (deny-list that
 * never heard of it). The projection now comes from the single classifier in
 * `user-client-view.ts`, whose halves are exhaustive over the schema.
 *
 * The manifest's `excluded` lines are generated from that same source, so the
 * document describing what was withheld cannot drift from what actually was.
 */
import { USER_EXPORT_OMITTED_FIELDS, USER_WITHHELD_FIELDS } from "@/lib/user-client-view";

export const ACCOUNT_EXPORT_FILENAME = "fleetcrown-account-export.json";

export { toExportUser } from "@/lib/user-client-view";

export function buildExportManifest(userId: string, sections: string[]) {
  return {
    product: "FleetCrown",
    exported_at: new Date().toISOString(),
    user_id: userId,
    scope: sections,
    excluded: [
      `never leaves the server: ${Object.keys(USER_WITHHELD_FIELDS).join(", ")}`,
      `withheld from this export: ${USER_EXPORT_OMITTED_FIELDS.join(", ")}`,
      "agent tokens and session tokens",
      "knowledge_embeddings vectors (chunk text and metadata are included)",
    ],
  };
}
