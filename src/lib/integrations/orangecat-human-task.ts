/**
 * Mirror a paid assignment into OrangeCat as a service — the engagement's
 * public record, priced in whatever currency it was agreed in (BTC included).
 *
 * READ THIS BEFORE TREATING IT AS THE PAYMENT CHANNEL. The service is created
 * with the studio's integration key, so OrangeCat owns it under the actor that
 * key is bound to — paying it pays the STUDIO, not the person who did the work.
 * The SDK's `actor_id` cannot help: it is documented as ignored under
 * integration-key auth, and there is no API on OrangeCat that creates an actor,
 * because a profile carries a wallet and a wallet belongs to the human who
 * holds its keys.
 *
 * So the two roles are split, and the split is the honest one:
 *
 *   this file          — the listing. What the work was, what it costs, which
 *                        project it belonged to. A receipt the studio can point
 *                        at, on the economic layer where such records live.
 *   the assignee's own — the destination. `crew:orangecat_profile` is their
 *   OrangeCat profile    OrangeCat page, and its Lightning wallet is theirs.
 *                        That link is what "pay them in BTC" actually means,
 *                        and it is carried on the task as `assigneePayUrl`.
 *
 * Everything here is fire-and-forget. A missing key, a network blip, or an
 * OrangeCat outage must never stop the operator handing work to a human: the
 * assignment still exists, the person is still asked, the fee is still written
 * on the row, and they can still be paid at their profile.
 *
 * Never called for a task without a fee — free help does not belong in a
 * marketplace, and listing it there would misrepresent both sides.
 */

import { getOrangeCatClient, OC_BASE } from "@/lib/integrations/orangecat";
import { linkTaskToOrangeCat, type HumanTaskRow } from "@/db/queries/human-tasks";

/** OrangeCat service permalink — same shape as the /projects/:id links the publish button emits. */
export function orangeCatServiceUrl(serviceId: string): string {
  return `${OC_BASE}/services/${serviceId}`;
}

export type TaskPublishResult = {
  serviceId: string | null;
  url: string | null;
  published: boolean;
  reason?: string;
};

export async function publishTaskToOrangeCat(
  userId: string,
  task: HumanTaskRow,
): Promise<TaskPublishResult> {
  if (task.feeAmount === null || task.feeAmount === undefined) {
    return { serviceId: null, url: null, published: false, reason: "no-fee" };
  }
  // Already mirrored — v0.1 of the SDK is create-only, so re-publishing would
  // mint a second service for the same assignment rather than update the first.
  if (task.orangecatServiceId) {
    return {
      serviceId: task.orangecatServiceId,
      url: task.orangecatUrl ?? orangeCatServiceUrl(task.orangecatServiceId),
      published: false,
      reason: "already-published",
    };
  }

  const client = await getOrangeCatClient();
  if (!client) {
    return { serviceId: null, url: null, published: false, reason: "orangecat-not-configured" };
  }

  const description = [
    task.brief,
    task.reason && `Why: ${task.reason}`,
    task.projectName && `Project: ${task.projectName}`,
    task.assigneeName && `Agreed with: ${task.assigneeName}`,
    // Named in the listing so anyone reading it can see who the work is
    // actually going to, and where paying them would land.
    task.assigneePayUrl && `Paid to: ${task.assigneePayUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const service = await client.services.create(
      {
        title: task.title,
        description: description || undefined,
        category: "human_task",
        fixed_price: task.feeAmount,
        currency: task.feeCurrency ?? undefined,
        service_location_type: "remote",
      },
      { idempotencyKey: `fleetcrown_human_task_${task.id}` },
    );
    const url = orangeCatServiceUrl(service.id);
    await linkTaskToOrangeCat(userId, task.id, { serviceId: service.id, url });
    return { serviceId: service.id, url, published: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "orangecat-publish-failed";
    console.warn("[orangecat] human task publish failed", { taskId: task.id, reason });
    return { serviceId: null, url: null, published: false, reason };
  }
}
