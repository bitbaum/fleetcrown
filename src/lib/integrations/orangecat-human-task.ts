/**
 * Mirror a paid human assignment into OrangeCat — the missing half of the loop.
 *
 * FleetCrown decides WHO does a piece of work and tracks whether they said yes.
 * It deliberately owns no money. OrangeCat is the economic layer, so a task
 * carrying a fee is published there as a `service` and the assignment keeps the
 * pointer — that is the whole seam between the two products, and it runs in one
 * direction only (FC → OC), like the subscription mirror it borrows from.
 *
 * Everything here is fire-and-forget. A missing key, a network blip, or an
 * OrangeCat outage must never stop the operator handing work to a human: the
 * assignment still exists, the person is still asked, the fee is still written
 * on the row. Only the pay-here link is absent, and it can be minted later.
 *
 * Never called for a task without a fee — free help does not belong in a
 * marketplace, and publishing it there would misrepresent both sides.
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
