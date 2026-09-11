import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserByOrangeCatActorId } from "@/db/queries/users";
import { countRecentNewSiteCommands } from "@/db/queries/pending-commands";
import { logDebug } from "@/db/queries/debug-logs";
import { verifyOrangeCatWebhookSignature } from "@/lib/integrations/orangecat-webhook";
import { requestNewSite } from "@/lib/hosted-runner/provision";

/**
 * The site factory's front door, opened to OrangeCat.
 *
 * The factory has been live on the box for weeks and had no HTTP entry point:
 * the only callers were a CLI and a test, so "OrangeCat asks FleetCrown to
 * build something" could not happen at all. `provision.ts` anticipated this
 * exact caller in its header comment. This route is the door, and deliberately
 * nothing more — every decision it could have re-made (what a valid slug is,
 * which labels are reserved, whether a live client site may be created from a
 * queue) already lives in `requestNewSite`, and a second caller that assembles
 * its own payload is how one path grows a check the other lacks.
 *
 * ## Why HMAC and not a bearer token
 *
 * FleetCrown already has an agent-token rail (`ck_*`), and using it here would
 * have been less code. It would also have been wrong: those tokens carry a
 * PERSON's full operator authority, so OrangeCat holding one would mean every
 * site built for any user was created by George, in George's account, with a
 * credential that also reaches the terminal-injection endpoints.
 *
 * The `x-orangecat-signature` rail both products already run says the right
 * thing instead: this is OrangeCat, the service, acting on behalf of the named
 * actor in the body. Same verification as /api/orangecat/entitlement, same
 * secret, same fail-closed posture when it is unset.
 *
 * ## Why it can still refuse a real user
 *
 * The factory creates a repo, a DNS record and a TLS certificate. Those are
 * real, rate-limited, externally-visible resources, so the caller has to be
 * attributable to an account that can be held responsible for them. An OrangeCat
 * actor with no linked FleetCrown user is refused with a 409 the caller can act
 * on, rather than being quietly attributed to the studio's own account — which
 * would turn this into an unmetered repo-and-domain creation primitive reachable
 * from a public "build it" button.
 */

/**
 * A narrowed vocabulary, not the register's full one.
 *
 * `requestNewSite` accepts six kinds and seven statuses because the CLI serves
 * an operator who knows what those words commit the studio to. A remote caller
 * is not that operator: `status: "live"` and `kind: "client-app"` are claims
 * about a customer relationship, and nothing about an automated build
 * establishes one. So the door accepts three kinds and forces the status.
 */
export const REMOTE_KINDS = ["demo", "product", "client-site"] as const;

/**
 * Every site this door creates is `unverified`, and that is not a placeholder.
 * The register's status column is a human claim about whether a site is real,
 * wanted and correct. A machine that just ran a scaffold has established none
 * of those things, and the honest word for that is the one that says so.
 */
export const FORCED_STATUS = "unverified";

/** Sites per account per day. A ceiling on damage, not a business rule. */
export const DAILY_SITE_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const Body = z.object({
  actorId: z.string().uuid(),
  slug: z.string().trim().min(1).max(63),
  title: z.string().trim().min(1).max(120),
  kind: z.enum(REMOTE_KINDS),
  /** Where on OrangeCat this was commissioned from — for attribution, not routing. */
  originUrl: z.string().trim().url().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.ORANGECAT_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: with no secret we cannot tell OrangeCat from anyone else,
    // and this endpoint creates domains.
    return NextResponse.json({ error: "site provisioning not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!verifyOrangeCatWebhookSignature(raw, req.headers.get("x-orangecat-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { actorId, slug, title, kind, originUrl } = parsed.data;

  const user = await getUserByOrangeCatActorId(actorId);
  if (!user) {
    return NextResponse.json(
      {
        error: "no linked FleetCrown account",
        // The caller shows this to a person, so it has to name the next step
        // rather than describe the internal state.
        detail:
          "This OrangeCat identity is not linked to a FleetCrown account yet. Sign in to FleetCrown with the same OrangeCat identity once, then try again.",
      },
      { status: 409 },
    );
  }

  const recent = await countRecentNewSiteCommands(user.id, new Date(Date.now() - DAY_MS));
  if (recent >= DAILY_SITE_LIMIT) {
    return NextResponse.json(
      {
        error: "daily site limit reached",
        detail: `This account has already requested ${recent} sites in the last 24 hours. Each one creates a repository, a subdomain and a certificate, so the limit is ${DAILY_SITE_LIMIT} per day.`,
      },
      { status: 429 },
    );
  }

  const result = await requestNewSite(user.id, { slug, title, kind, status: FORCED_STATUS });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Attribution is recorded rather than inferred: without it, a register row
  // says a site exists and nothing anywhere says who asked for it or why.
  await logDebug({
    source: "orangecat/site",
    level: "info",
    message: "site provisioning requested from OrangeCat",
    meta: { actorId, userId: user.id, slug, kind, originUrl, commandId: result.commandId },
  }).catch(() => {});

  // 202, not 200: the repo, box sync and deploy take minutes, so nothing has
  // been built when this returns. The caller polls the command id.
  return NextResponse.json(
    {
      ok: true,
      commandId: result.commandId,
      host: result.host,
      url: `https://${result.host}`,
      status: FORCED_STATUS,
    },
    { status: 202 },
  );
}
