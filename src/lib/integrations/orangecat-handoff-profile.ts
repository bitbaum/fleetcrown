/**
 * Fill a FleetCrown project profile from an OrangeCat build handoff.
 *
 * Deterministic first: everything the token states outright (origin URL,
 * client, status, next step) is written without a model. Then, if Groq is
 * reachable, the description is read once for mission/customers/problem/
 * solution — the fields the agent dossier injects (DRIVING_FIELDS). Both
 * passes fill gaps only (`onlyMissing`): a project the owner has already
 * described keeps the owner's words.
 */

import { upsertEntityAttribute } from "@/db/queries/utils";
import { applyProjectProfile, extractProjectProfile } from "@/lib/project-brief";
import { handoffAttributes, type OrangeCatBuildIntent } from "./orangecat-build-intent";

export async function fillProfileFromHandoff(
  userId: string,
  entityId: string,
  intent: OrangeCatBuildIntent,
): Promise<void> {
  for (const [key, value] of Object.entries(handoffAttributes(intent))) {
    await upsertEntityAttribute(userId, entityId, key, value);
  }

  const description = intent.entity.description?.trim();
  if (!description || description.length < 40) return;
  try {
    const profile = await extractProjectProfile(intent.entity.title, description);
    // The deterministic pass above already owns these; the model must not
    // overwrite a stated fact with an inferred one.
    delete profile.status;
    delete profile.next_step;
    await applyProjectProfile(userId, entityId, profile, { onlyMissing: true });
  } catch {
    // Groq unavailable or rate-limited: the stated fields are already written.
  }
}
