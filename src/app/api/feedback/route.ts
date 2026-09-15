import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT_WINDOW_SHORT_MS, RATE_LIMIT_WINDOW_LONG_MS } from "@/lib/constants/time";
import {
  FEEDBACK_SCOPE_VALUES,
  FEEDBACK_SOURCE,
  FEEDBACK_SOURCE_VALUES,
  WIDGET_TOKEN_STATUS,
} from "@/lib/constants/statuses";
import { getWidgetTokenByToken } from "@/db/queries/widget-tokens";
import { bumpDuplicateFeedback, insertSiteFeedback } from "@/db/queries/site-feedback";
import { feedbackContentHash } from "@/lib/feedback/content-hash";
import { notifyFeedbackReceived } from "@/lib/feedback/notify-new";
import { mintTrackToken, normalizeSubmitterEmail, trackUrl } from "@/lib/feedback/submitter";

/**
 * Public ingest for the embeddable feedback widget (docs/architecture/
 * feedback-widget.md). Cross-origin POST from customer sites, so this route:
 *   • is excluded from the auth middleware in proxy.ts
 *   • answers CORS preflight (JSON POST always triggers one)
 *   • authenticates via the write-only fcw_* widget token in the body
 *
 * ACAO is `*` — the token grants submit-only capability and no cookies are
 * involved, so origin secrecy buys nothing. The per-token `origins` allowlist
 * is enforced server-side against the Origin header instead.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function corsError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
}

const FeedbackBody = z.object({
  token: z.string().startsWith("fcw_").max(100),
  suggestion: z.string().trim().min(1).max(2000),
  contact: z.string().max(200).optional(),
  /** The reporter's address, when the widget collected it as its own field.
   *  Optional and additive: bundles already embedded on customer sites send
   *  only `contact`, and an address typed in there is still picked up below.
   *  widget.js is cached in other people's pages — the server can never assume
   *  the newest bundle is the one talking to it. */
  email: z.string().max(254).optional(),
  page: z.string().max(300).optional(),
  url: z.string().max(1000).optional(),
  pageTitle: z.string().max(300).optional(),
  scope: z.enum(FEEDBACK_SCOPE_VALUES).optional(),
  // Who filed it — the widget omits this (→ visitor); the AI reviewer and
  // synthesizer declare themselves. Self-asserted via the public token, so a
  // routing hint, not a trust boundary.
  source: z.enum(FEEDBACK_SOURCE_VALUES).optional(),
  /** Visitor-attached images, client-downscaled by the widget. Data URLs only;
   *  the char cap bounds storage per image (~450 KB each). */
  screenshots: z
    .array(
      z
        .string()
        .regex(/^data:image\/(jpeg|png|webp);base64,/)
        .max(600_000),
    )
    .max(5)
    .optional(),
  selectedElements: z
    .array(
      z.object({
        elementType: z.string().max(100),
        elementText: z.string().max(300),
        selector: z.string().max(500),
      }),
    )
    .max(10)
    .optional(),
});

export function OPTIONS(req: NextRequest) {
  // Reflect whatever headers the browser asks for: customer sites monkey-patch
  // window.fetch and stamp extra headers (e.g. a csrf header) onto EVERY POST,
  // including the widget's cross-origin one — a hardcoded allowlist fails their
  // preflight and silently kills ingest. Header names are not a security
  // boundary here; the Origin allowlist check in POST is.
  const requested = req.headers.get("access-control-request-headers");
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      ...(requested ? { "Access-Control-Allow-Headers": requested } : {}),
    },
  });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`feedback:ip:${ip}`, 10, RATE_LIMIT_WINDOW_SHORT_MS)) {
    return corsError("Too many submissions, try again later", 429);
  }

  const raw = await req.json().catch(() => null);
  const parsed = FeedbackBody.safeParse(raw);
  if (!parsed.success) return corsError("Invalid submission", 400);
  const data = parsed.data;

  const token = await getWidgetTokenByToken(data.token);
  if (!token) return corsError("Unknown or revoked widget token", 403);

  // Pause has to mean pause. The boot call stops the widget RENDERING, but the
  // token is public and sits in the customer's page source, so a paused project
  // was still accepting POSTs from anyone who kept a copy — and the operator,
  // seeing no widget on the site, had no reason to think otherwise. The UI
  // offers Pause as the way to stop collecting; make the ingest agree with it.
  if (token.status !== WIDGET_TOKEN_STATUS.ACTIVE) {
    return corsError("Feedback is paused for this site", 403);
  }

  // Server-side origin allowlist (empty/null = any origin).
  const origin = req.headers.get("origin");
  if (token.origins?.length && (!origin || !token.origins.includes(origin))) {
    return corsError("Origin not allowed for this widget", 403);
  }

  // Second-tier cap per token: one hostile page can't flood a project's inbox
  // from many IPs without tripping this.
  if (!checkRateLimit(`feedback:token:${token.id}`, 200, RATE_LIMIT_WINDOW_LONG_MS)) {
    return corsError("Too many submissions, try again later", 429);
  }

  // Dedupe at ingest: the same complaint filed again bumps the existing open
  // row's duplicate_count instead of creating a new row — volume signal kept,
  // inbox noise dropped. Idempotent for the visitor (they still see success).
  const contentHash = feedbackContentHash(data.suggestion, data.page ?? null);
  const bumped = await bumpDuplicateFeedback(token.projectId, contentHash);
  if (bumped) {
    // No track link on this path, deliberately.
    //
    // It is tempting to hand back the EXISTING row's token so a re-filed report
    // still gets a follow-up page. But dedupe is per-PROJECT across all
    // visitors, not per person: two strangers reporting "the signup button is
    // broken" on the same page collide here. So the usual recipient of that
    // token would be someone other than the person who filed the report — and
    // the token is a capability, not a receipt. It would let them read that
    // report's page and, worse, CLAIM it into their own account (possession is
    // how claiming works). A duplicate submitter gets the plain confirmation
    // instead; the widget renders that case without a follow-up block.
    return NextResponse.json({ ok: true, duplicateOf: bumped }, { headers: CORS_HEADERS });
  }

  // Who filed it. `email` is the widget's own field; `contact` is the older
  // free-text box people also type addresses into — either is accepted, and
  // anything that is not an address stays in `contact` unattributed.
  const submitterEmail =
    normalizeSubmitterEmail(data.email) ?? normalizeSubmitterEmail(data.contact);
  // NOTE what is deliberately NOT done here: the address is not looked up and
  // the row is not bound to a matching account. This endpoint is public and
  // unauthenticated — its token sits in the customer's page source — so the
  // address is whatever the poster typed. Binding on it would let anyone push
  // rows into a stranger's account forever, with the victim never having
  // touched anything. Binding happens on an act of the ACCOUNT's own instead
  // (opening the track link, or verifying the address): see lib/feedback/claim.ts.
  //
  // The lookup is also skipped because its ANSWER is dangerous: a response
  // that varied by whether an address has a Loki account would turn this route
  // into an account-enumeration oracle for anyone who reads their own HTML.

  const created = await insertSiteFeedback({
    projectId: token.projectId,
    userId: token.userId,
    tokenId: token.id,
    suggestion: data.suggestion,
    contact: data.contact ?? null,
    submitterEmail,
    trackToken: mintTrackToken(),
    page: data.page ?? null,
    url: data.url ?? null,
    pageTitle: data.pageTitle ?? null,
    scope: data.scope ?? null,
    source: data.source ?? FEEDBACK_SOURCE.VISITOR,
    contentHash,
    screenshots: data.screenshots ?? null,
    selectedElements: data.selectedElements ?? null,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (!created) return corsError("Could not store feedback, try again later", 500);

  // Persist-first, announce second (the doc's "optional notification later",
  // finally): fire-and-forget so a notify hiccup can never fail the ingest.
  // Duplicate bumps above stay silent — the row announced when first filed.
  void notifyFeedbackReceived(created);

  // The link is the point of the whole exchange: it is what turns "sent into
  // the void" into something the reporter can come back to. Returned from the
  // request's own origin so one deployment never hands out another's URLs.
  return NextResponse.json(
    {
      ok: true,
      ...(created.trackToken ? { track: trackUrl(req.nextUrl.origin, created.trackToken) } : {}),
    },
    { headers: CORS_HEADERS },
  );
}
