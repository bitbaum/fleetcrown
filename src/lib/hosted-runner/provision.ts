// SSOT for requesting a NEW site from the fleet.
//
// Mirrors hosted-runner/dispatch.ts, which is the same idea for coding tasks:
// every caller — the CLI, a future Control button, an OrangeCat "build me a
// site" flow — funnels through here so validation and enqueue happen in exactly
// one place. A second caller that builds its own payload is how one path grows
// a check the other lacks.
//
// The validation lives in new-site.ts and runs TWICE on purpose: here, so a bad
// request is refused at the door with a useful message instead of sitting in a
// queue until a runner rejects it minutes later; and again in the runner, which
// is the process that actually executes and therefore cannot trust that anyone
// upstream checked. Neither is redundant — one is UX, the other is the boundary.

import { enqueueHostedNewSiteCommand } from "@/db/queries/pending-commands";
import { validateNewSiteRequest, type NewSiteRequest } from "@/lib/hosted-runner/new-site";

export type ProvisionSiteResult =
  | { ok: true; commandId: string; request: NewSiteRequest; host: string }
  | { ok: false; status: number; error: string };

/**
 * Queue a site for creation.
 *
 * Returns the command id rather than waiting: provisioning runs a repo
 * creation, a box sync and a deploy, which takes minutes. The caller polls the
 * command (or watches Activity); it does not hold a request open.
 */
export async function requestNewSite(
  userId: string,
  input: unknown,
  opts: { baseDomain?: string } = {},
): Promise<ProvisionSiteResult> {
  const parsed = validateNewSiteRequest(input);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.reason };
  }
  const req = parsed.value;
  const commandId = await enqueueHostedNewSiteCommand(userId, {
    slug: req.slug,
    title: req.title,
    kind: req.kind,
    status: req.status,
  });
  return {
    ok: true,
    commandId,
    request: req,
    host: `${req.slug}.${opts.baseDomain ?? "orangecat.ch"}`,
  };
}
